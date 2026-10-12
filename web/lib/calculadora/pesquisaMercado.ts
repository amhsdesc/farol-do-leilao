"use server";

/**
 * "Pesquisar valor de mercado": busca anúncios de imóveis parecidos na região (portais de venda) e calcula
 * o preço médio por m². Usa a API da Anthropic com a ferramenta de busca na web (o mesmo provedor de IA já
 * usado no coletor, para não somar mais uma conta/mais um cartão ao projeto). Cada clique no botão custa uma
 * chamada de API (poucos centavos), diferente do resto do site, que é só consulta ao banco.
 */

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
  | { ok: true; precoM2Medio: number; amostras: AmostraMercado[]; observacao?: string }
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
  return !!process.env.ANTHROPIC_API_KEY;
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
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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

export async function pesquisarValorMercado(e: EntradaPesquisaMercado): Promise<ResultadoPesquisaMercado> {
  if (!(await mercadoConfigurado())) {
    return { ok: false, erro: "Pesquisa de valor de mercado ainda não está configurada neste site." };
  }
  if (!e.uf || !e.cidade || !e.area || e.area <= 0) {
    return { ok: false, erro: "Informe estado, cidade e área do imóvel para pesquisar." };
  }

  const tipoBusca = TIPOS_BUSCA[e.tipo] ?? "imóvel";
  const local = [e.bairro, e.cidade, e.uf].filter(Boolean).join(", ");
  const areaMin = Math.round(e.area * 0.6);
  const areaMax = Math.round(e.area * 1.6);

  const prompt = `Pesquise na web anúncios de venda (não aluguel) de ${tipoBusca} em ${local}, Brasil, em portais
como Viva Real, ZAP Imóveis, Imovelweb, OLX Imóveis, QuintoAndar ou Chaves na Mão. Priorize imóveis com área
entre ${areaMin} m² e ${areaMax} m² (o imóvel em questão tem ${e.area} m²)${e.quartos ? ` e cerca de ${e.quartos} quarto(s)` : ""}.
Junte pelo menos 5 anúncios diferentes, de fontes diferentes quando possível. Para cada um, anote título, preço
anunciado (R$) e área (m²). Descarte anúncios de aluguel, de outra cidade, ou claramente fora do padrão (preço
por m² muito distante da mediana). Calcule o preço por m² de cada anúncio e a média dos que sobraram.

Responda só com um bloco \`\`\`json com este formato exato, sem texto antes ou depois:
{
  "amostras": [{"titulo": "...", "preco": 000000, "area": 00, "precoM2": 0000, "url": "https://..."}],
  "precoM2Medio": 0000,
  "observacao": "uma frase curta sobre a confiança da estimativa, se achou poucos anúncios, etc. (opcional)"
}`;

  try {
    let texto = "";
    let json: RespostaMercado | null = null;
    let timeout = false;
    // até 2 tentativas: a primeira pode falhar por sobrecarga da API, demora ou resposta fora do formato
    for (let tentativa = 1; tentativa <= 2 && !json; tentativa++) {
      try {
        const r = await perguntar(prompt);
        texto = r.texto;
        if (!texto.trim()) {
          console.error(`[mercado] tentativa ${tentativa}: resposta sem texto (stop_reason=${r.parou})`);
          continue;
        }
        json = extrairJson(texto) as RespostaMercado;
      } catch (err) {
        timeout = err instanceof Error && err.name === "TimeoutError";
        console.error(`[mercado] tentativa ${tentativa} falhou:`, err instanceof Error ? err.message : err, "| início da resposta:", texto.slice(0, 200));
        if (err instanceof FalhaDefinitiva) break; // chave inválida, pedido malformado etc.: repetir não adianta
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
