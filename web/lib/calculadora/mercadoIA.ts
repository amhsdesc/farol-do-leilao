/**
 * Reserva paga do valor de mercado: a API da Anthropic com busca na web. Só é chamada quando o banco e o Chaves na
 * Mão não resolveram, e só a pedido de um assinante (ver ./mercadoCore.ts). O teto diário fica no armazém.
 */
import type { AnuncioMcp } from "./mercadoMcp.ts";

/** Anúncios úteis mínimos para aceitar a resposta da IA (o prompt pede 4 a 6). */
export const MINIMO_IA = 3;

/** Chave própria do site (o Console mostra o gasto à parte do coletor); sem ela, usa a geral. */
export const chaveIA = () => process.env.ANTHROPIC_API_KEY_SITE || process.env.ANTHROPIC_API_KEY || "";

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

export type RespostaIA =
  | { ok: true; anuncios: AnuncioMcp[] }
  /** vazio = a IA respondeu (já gastou tokens) mas não trouxe nada utilizável: vale guardar para não pagar de novo */
  | { ok: false; erro: string; vazio: boolean };

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

class FalhaDefinitiva extends Error {}

async function perguntar(prompt: string): Promise<{ texto: string; parou: string | undefined }> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chaveIA(),
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

export async function buscarNaWeb(e: { tipo: string }, faixa: { min: number; max: number }, local: string): Promise<RespostaIA> {
  const tipoBusca = TIPOS_BUSCA[e.tipo] ?? "imóvel";
  const prompt = `Busque anúncios de VENDA de ${tipoBusca} em ${local}, Brasil (Viva Real, ZAP, Imovelweb, OLX, QuintoAndar), com ${faixa.min} a ${faixa.max} m². Reúna 4 a 6 anúncios, ignore aluguel e outliers.
Responda SÓ com este JSON, sem texto antes ou depois (título com até 6 palavras):
\`\`\`json
{"amostras":[{"titulo":"...","preco":0,"area":0,"url":"https://..."}]}
\`\`\``;
  try {
    let texto = "";
    let json: { amostras?: unknown[] } | null = null;
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
        json = extrairJson(texto) as { amostras?: unknown[] };
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
        vazio: !timeout && texto.trim() !== "", // respondeu mas ilegível: já pagou; timeout ou rede: nada a guardar
        erro: timeout
          ? "A pesquisa demorou demais. Tente de novo; costuma funcionar na segunda vez."
          : texto.trim()
            ? "A pesquisa voltou num formato que não consegui ler. Tente de novo."
            : "Não consegui pesquisar agora. Tente de novo em instantes.",
      };
    }
    // o R$/m² é sempre recalculado aqui (preço ÷ área); nunca se confia na conta do modelo
    const anuncios: AnuncioMcp[] = (json.amostras ?? [])
      .map((a) => a as Record<string, unknown>)
      .filter((a) => typeof a.preco === "number" && a.preco > 0 && typeof a.area === "number" && a.area > 0)
      .map((a) => ({
        titulo: String(a.titulo ?? "Anúncio"),
        preco: Number(a.preco),
        area: Number(a.area),
        precoM2: Math.round((Number(a.preco) / Number(a.area)) * 100) / 100,
        url: typeof a.url === "string" && /^https?:\/\//i.test(a.url) ? a.url : undefined,
        bairro: "",
      }));
    if (!anuncios.length) {
      return { ok: false, vazio: true, erro: "Não encontrei anúncios parecidos o bastante para estimar um preço por m². Tente com outra cidade ou bairro." };
    }
    return { ok: true, anuncios };
  } catch (err) {
    console.error("[mercado] erro inesperado:", err);
    return { ok: false, vazio: false, erro: "Não consegui pesquisar agora. Tente de novo em instantes." };
  }
}
