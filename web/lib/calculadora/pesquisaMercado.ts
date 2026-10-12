"use server";

/**
 * "Pesquisar valor de mercado": calcula o preço por m² de ANÚNCIOS de venda parecidos na região (nunca dos
 * editais, que é justamente o que queremos comparar). Ordem, da mais barata para a mais cara:
 *  1) cache de 30 dias (custo zero);
 *  2) servidor MCP público do Chaves na Mão, sem IA (custo zero em tokens), se houver anúncios suficientes DO
 *     BAIRRO pedido (ou da cidade, quando não há bairro);
 *  3) só então a API da Anthropic com busca na web (poucos centavos por pesquisa).
 */
import { buscarNoChaves } from "./mercadoMcp.ts";

export type EntradaPesquisaMercado = {
  uf: string;
  cidade: string;
  bairro?: string | null;
  tipo: string; // apartamento | casa | terreno | comercial | galpao | rural | ...
  area: number;
  quartos?: number | null;
};

export type AmostraMercado = {
  titulo: string;
  preco: number;
  area: number;
  precoM2: number;
  url?: string;
};

export type ResultadoPesquisaMercado =
  | { ok: true; precoM2Medio: number; amostras: AmostraMercado[]; observacao?: string; fonte?: "chaves-na-mao" | "ia" }
  | { ok: false; erro: string };

const TIPOS_BUSCA: Record<string, string> = {
  apartamento: "apartamento",
  casa: "casa",
  terreno: "terreno",
  comercial: "imóvel comercial/sala/loja",
  galpao: "galpão",
  rural: "imóvel rural/chácara/fazenda",
  vaga: "vaga de garagem",
  outros: "imóvel",
};

export async function mercadoConfigurado() {
  return true; // o caminho sem IA (MCP) não precisa de chave; a IA só entra como reserva, se houver chave
}

function extrairJson(texto: string): unknown {
  const candidatos: string[] = [];
  for (const m of texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidatos.push(m[1]);
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini >= 0 && fim > ini) candidatos.push(texto.slice(ini, fim + 1));
  // o último bloco costuma ser o resultado final (antes dele o modelo pode ter "pensado em voz alta")
  for (const c of candidatos.reverse()) {
    try {
      return JSON.parse(c);
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error("resposta sem JSON válido");
}

type RespostaMercado = { amostras?: unknown[]; precoM2Medio?: number; observacao?: string };

class FalhaDefinitiva extends Error {}

async function perguntar(prompt: string): Promise<{ texto: string; parou: string | undefined }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODELO_MERCADO || process.env.MODELO_LLM || "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!resp.ok) {
    const corpo = (await resp.text().catch(() => "")).slice(0, 300);
    console.error(`[mercado] Anthropic respondeu ${resp.status}: ${corpo}`);
    if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
    throw new FalhaDefinitiva(`HTTP ${resp.status}`);
  }
  const dados = await resp.json();
  const texto = (dados.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
  return { texto, parou: dados.stop_reason };
}

const LIMITES_AREA = [0, 30, 45, 60, 80, 100, 130, 170, 250, 400, 700, 1500, 5000, Infinity];

/** Agrupa áreas parecidas na mesma faixa: pesquisas de imóveis de tamanho próximo reaproveitam o mesmo resultado. */
function faixaDeArea(area: number): { min: number; max: number } {
  const i = LIMITES_AREA.findIndex((lim, k) => area >= lim && area < LIMITES_AREA[k + 1]);
  const min = LIMITES_AREA[Math.max(i, 0)];
  const max = LIMITES_AREA[Math.max(i, 0) + 1];
  return { min: Math.max(Math.round(min * 0.85), 10), max: Number.isFinite(max) ? Math.round(max * 1.15) : Math.round(min * 2) };
}

function normalizarChave(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-");
}

class NaoGuardar extends Error {
  resultado: ResultadoPesquisaMercado;
  constructor(resultado: ResultadoPesquisaMercado) {
    super("resultado não guardado");
    this.resultado = resultado;
  }
}

const TRINTA_DIAS = 30 * 24 * 3600;

async function comCache(chave: string[], buscar: () => Promise<ResultadoPesquisaMercado>): Promise<ResultadoPesquisaMercado> {
  let unstable_cache: typeof import("next/cache").unstable_cache;
  try {
    ({ unstable_cache } = await import("next/cache"));
  } catch {
    return buscar(); // fora do Next (testes): sem cache
  }
  try {
    return await unstable_cache(
      async () => {
        const r = await buscar();
        if (!r.ok) throw new NaoGuardar(r); // lançar impede que a falha vire "resposta guardada"
        return r;
      },
      ["mercado-v2", ...chave],
      { revalidate: TRINTA_DIAS },
    )();
  } catch (err) {
    if (err instanceof NaoGuardar) return err.resultado;
    if (err instanceof Error && /incrementalCache|static generation store/i.test(err.message)) return buscar();
    throw err;
  }
}

export async function pesquisarValorMercado(e: EntradaPesquisaMercado): Promise<ResultadoPesquisaMercado> {
  if (!e.uf || !e.cidade || !e.area || e.area <= 0) {
    return { ok: false, erro: "Informe estado, cidade e área do imóvel para pesquisar." };
  }

  const tipoBusca = TIPOS_BUSCA[e.tipo] ?? "imóvel";
  const local = [e.bairro, e.cidade, e.uf].filter(Boolean).join(", ");
  const faixa = faixaDeArea(e.area);

  const prompt = `Busque anúncios de VENDA de ${tipoBusca} em ${local}, Brasil (Viva Real, ZAP, Imovelweb, OLX, QuintoAndar), com ${faixa.min} a ${faixa.max} m²${e.quartos ? ` e cerca de ${e.quartos} quarto(s)` : ""}. Reúna 4 a 6 anúncios, ignore aluguel e outliers.
Responda SÓ com este JSON, sem texto antes ou depois (título com até 6 palavras):
\`\`\`json
{"amostras":[{"titulo":"...","preco":0,"area":0,"url":"https://..."}],"observacao":"opcional, 1 frase curta"}
\`\`\``;

  // Resultados bons ficam guardados por 30 dias: o preço por m² de uma região muda devagar,
  // e cada pesquisa nova custa uma chamada com busca na web (a parte cara). Falhas nunca são guardadas.
  const chave = [e.uf, normalizarChave(e.cidade), normalizarChave(e.bairro ?? ""), e.tipo, `${faixa.min}-${faixa.max}`, String(e.quartos ?? "")];
  return comCache(chave, async () => {
    // 1º: caminho sem IA. Só aceita se tiver anúncios suficientes do bairro pedido.
    const mcp = process.env.MERCADO_SEM_MCP === "1" ? ({ ok: false, motivo: "desligado por MERCADO_SEM_MCP=1" } as const) : await buscarNoChaves(e, faixa);
    if (mcp.ok) {
      return {
        ok: true,
        precoM2Medio: mcp.precoM2,
        fonte: "chaves-na-mao",
        amostras: mcp.amostras.map((a) => ({ titulo: a.titulo, preco: a.preco, area: a.area, precoM2: a.precoM2, url: a.url })),
        observacao: `Mediana de ${mcp.total} anúncios de venda ${mcp.escopo === "bairro" ? `no bairro ${e.bairro}` : `em ${e.cidade}`} (Chaves na Mão, preços pedidos).`,
      } satisfies ResultadoPesquisaMercado;
    }
    console.info(`[mercado] sem IA insuficiente: ${mcp.motivo}`);
    // 2º: reserva com IA, só se houver chave configurada.
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, erro: "Não há anúncios suficientes para estimar o preço por m² dessa região." } satisfies ResultadoPesquisaMercado;
    }
    const r = await buscarNaWeb(prompt);
    return r.ok ? { ...r, fonte: "ia" as const } : r;
  });
}

async function buscarNaWeb(prompt: string): Promise<ResultadoPesquisaMercado> {
  try {
    let texto = "";
    let json: RespostaMercado | null = null;
    let timeout = false;
    // 2ª tentativa só quando a 1ª falhou ANTES de gastar tokens (API sobrecarregada, rede). Resposta ilegível ou
    // demora não são repetidas: uma nova busca na web custaria tudo de novo.
    for (let tentativa = 1; tentativa <= 2 && !json; tentativa++) {
      try {
        const r = await perguntar(prompt);
        texto = r.texto;
        if (!texto.trim()) {
          console.error(`[mercado] resposta sem texto (stop_reason=${r.parou})`);
          break;
        }
        json = extrairJson(texto) as RespostaMercado;
      } catch (err) {
        timeout = err instanceof Error && err.name === "TimeoutError";
        console.error(`[mercado] tentativa ${tentativa} falhou:`, err instanceof Error ? err.message : err, "| início da resposta:", texto.slice(0, 200));
        const antesDeGastar = err instanceof Error && (/^HTTP (429|5\d\d)$/.test(err.message) || err.name === "TypeError");
        if (err instanceof FalhaDefinitiva || !antesDeGastar) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!json) {
      return {
        ok: false,
        erro: timeout
          ? "A pesquisa demorou demais. Tente de novo; costuma funcionar na segunda vez."
          : texto.trim()
            ? "A pesquisa voltou num formato que não consegui ler. Tente de novo."
            : "Não consegui pesquisar agora. Tente de novo em instantes.",
      };
    }

    const amostras: AmostraMercado[] = (json.amostras ?? [])
      .map((a) => a as Record<string, unknown>)
      .filter((a) => typeof a.preco === "number" && typeof a.area === "number" && a.area > 0)
      .map((a) => ({
        titulo: String(a.titulo ?? "Anúncio"),
        preco: Number(a.preco),
        area: Number(a.area),
        precoM2: typeof a.precoM2 === "number" ? a.precoM2 : Math.round((Number(a.preco) / Number(a.area)) * 100) / 100,
        url: typeof a.url === "string" ? a.url : undefined,
      }));
    const precoM2Medio =
      typeof json.precoM2Medio === "number" && json.precoM2Medio > 0
        ? Math.round(json.precoM2Medio * 100) / 100
        : amostras.length
          ? Math.round((amostras.reduce((s, a) => s + a.precoM2, 0) / amostras.length) * 100) / 100
          : 0;

    if (!precoM2Medio || !amostras.length) {
      return { ok: false, erro: "Não encontrei anúncios parecidos o bastante para estimar um preço por m². Tente com outra cidade ou bairro." };
    }
    return { ok: true, precoM2Medio, amostras, observacao: typeof json.observacao === "string" ? json.observacao : undefined };
  } catch (err) {
    console.error("[mercado] erro inesperado:", err);
    return { ok: false, erro: "Não consegui pesquisar agora. Tente de novo em instantes." };
  }
}
