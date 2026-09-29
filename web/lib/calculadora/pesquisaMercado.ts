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
  const bloco = texto.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) throw new Error("resposta sem JSON");
  return JSON.parse(bloco);
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
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODELO_MERCADO || process.env.MODELO_LLM || "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      return { ok: false, erro: `A busca falhou (código ${resp.status}). Tente de novo em instantes.` };
    }
    const dados = await resp.json();
    const blocosTexto = (dados.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text);
    const texto = blocosTexto.join("\n");
    if (!texto.trim()) return { ok: false, erro: "Não encontrei anúncios parecidos com esses dados. Tente ajustar cidade ou bairro." };

    const json = extrairJson(texto) as {
      amostras?: unknown[];
      precoM2Medio?: number;
      observacao?: string;
    };
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
  } catch {
    return { ok: false, erro: "Não consegui pesquisar agora. Tente de novo em instantes." };
  }
}
