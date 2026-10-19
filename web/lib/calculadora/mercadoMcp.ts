/**
 * Preço de mercado por m² SEM IA: consulta o servidor MCP público do Chaves na Mão (JSON-RPC simples, sem chave,
 * sem login; o próprio site indica esse caminho para agentes e robôs em /llms.txt). Custo: zero tokens.
 *
 * Limites conhecidos (testados em 12/10/2026):
 *  - o filtro de bairro do servidor é "frouxo" ("Asa Norte" traz também Samambaia Norte, Ceilândia Norte...),
 *    então o bairro é conferido AQUI, anúncio por anúncio, pelo nome exato;
 *  - 15 anúncios por página, até 20 páginas (a resposta traz pagination.totalResults/totalPages); limite de 60 requisições/min por IP (usamos poucas, em sequência);
 *  - são preços de anúncio (pedidos), não de venda fechada.
 */

export type TipoBuscaMcp = { propertyType: string };

const URL_MCP = "https://www.chavesnamao.com.br/api/mcp/";
const UA = "FarolDoLeilaoBot/0.1 (+https://faroldoleilao.com.br; agregador de leiloes; contato: desc.alex@gmail.com)";

const TIPOS_MCP: Record<string, string> = {
  apartamento: "apartamento",
  casa: "casa",
  terreno: "terreno",
  comercial: "sala comercial",
  galpao: "galpão",
  rural: "rural",
};

/** Tipos que o portal cobre; os demais (vaga, outros) só têm a reserva com IA. */
export const TIPOS_COBERTOS = Object.keys(TIPOS_MCP);

/** Quantos anúncios do próprio bairro (ou da cidade, sem bairro) precisamos para confiar na mediana. */
export const MINIMO_BAIRRO = 8;
export const MINIMO_CIDADE = 15;
const MAX_PAGINAS = 4;
const PAUSA_MS = 1100; // ≤ 1 requisição/s, bem abaixo do limite de 60/min

export type AnuncioMcp = { titulo: string; preco: number; area: number; precoM2: number; url?: string; bairro: string };

export type ResultadoMcp =
  | {
      ok: true;
      precoM2: number; // mediana
      p25: number;
      p75: number;
      amostras: AnuncioMcp[]; // os 6 mais parecidos em área
      total: number; // anúncios usados na mediana
      escopo: "bairro" | "cidade";
      /** Todos os anúncios válidos lidos (de qualquer bairro, quando a busca foi da cidade): quem chama pode reaproveitar. */
      anuncios: AnuncioMcp[];
    }
  | {
      ok: false;
      motivo: string;
      /** insuficiente = o portal respondeu mas faltam anúncios (vale guardar a tentativa); indisponivel = rede/erro (não guardar); sem_cobertura = tipo que o portal não tem */
      causa: "insuficiente" | "indisponivel" | "sem_cobertura";
      vistos: number;
      anuncios: AnuncioMcp[];
    };

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** "Taguatinga Sul (Taguatinga)" casa com "Taguatinga Sul"; "Asa Norte" NÃO casa com "Samambaia Norte". */
export function bairroConfere(procurado: string, doAnuncio: string): boolean {
  const alvo = normalizar(procurado);
  if (!alvo) return false;
  const inteiro = normalizar(doAnuncio);
  const antesDoParenteses = normalizar(doAnuncio.replace(/\(.*?\)/g, ""));
  return alvo === inteiro || alvo === antesDoParenteses;
}

export function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Quantil por interpolação linear (q entre 0 e 1). */
export function quantil(valores: number[], q: number): number {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 1) return v[0];
  const pos = (v.length - 1) * q;
  const base = Math.floor(pos);
  return v[base] + (v[Math.min(base + 1, v.length - 1)] - v[base]) * (pos - base);
}

const centavos = (x: number) => Math.round(x * 100) / 100;

/** Calcula a mediana de R$/m² (e o intervalo p25–p75) descartando valores absurdos (erro de cadastro: preço de aluguel, área errada). */
export function resumir(anuncios: AnuncioMcp[]): { precoM2: number; p25: number; p75: number; usados: AnuncioMcp[] } | null {
  if (!anuncios.length) return null;
  const med = mediana(anuncios.map((a) => a.precoM2));
  const usados = anuncios.filter((a) => a.precoM2 >= med * 0.4 && a.precoM2 <= med * 2.5);
  if (!usados.length) return null;
  const m2 = usados.map((a) => a.precoM2);
  return { precoM2: centavos(mediana(m2)), p25: centavos(quantil(m2, 0.25)), p75: centavos(quantil(m2, 0.75)), usados };
}

function lerCorpo(texto: string): unknown {
  const t = texto.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  for (const linha of t.split("\n")) if (linha.startsWith("data:")) return JSON.parse(linha.slice(5).trim());
  throw new Error("resposta MCP ilegível");
}

type Pagina = { results?: Array<Record<string, unknown>> };

export async function buscarNoChaves(
  e: { uf: string; cidade: string; bairro?: string | null; tipo: string; area: number },
  faixa: { min: number; max: number },
  pausa: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ResultadoMcp> {
  const propertyType = TIPOS_MCP[e.tipo];
  if (!propertyType) return { ok: false, motivo: `tipo "${e.tipo}" sem cobertura no Chaves na Mão`, causa: "sem_cobertura", vistos: 0, anuncios: [] };

  const base: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": UA };
  const rpc = async (corpo: object, sessao?: string) => {
    const resp = await fetch(URL_MCP, {
      method: "POST",
      headers: sessao ? { ...base, "mcp-session-id": sessao } : base,
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8_000),
    });
    return resp;
  };

  try {
    const ini = await rpc({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "farol-do-leilao", version: "0.1" } },
    });
    if (!ini.ok) return { ok: false, motivo: `MCP initialize HTTP ${ini.status}`, causa: "indisponivel", vistos: 0, anuncios: [] };
    const sessao = ini.headers.get("mcp-session-id") ?? undefined;
    await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, sessao).catch(() => undefined);

    const comBairro = !!e.bairro?.trim();
    const meta = comBairro ? MINIMO_BAIRRO : MINIMO_CIDADE;
    const achados: AnuncioMcp[] = [];
    let vistos = 0;

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      if (pagina > 1) await pausa(PAUSA_MS);
      const filtros: Record<string, unknown> = {
        transaction: "venda", propertyType, city: e.cidade, state: e.uf.toUpperCase(),
        minArea: faixa.min, maxArea: faixa.max,
      };
      if (comBairro) filtros.neighborhood = e.bairro;
      const resp = await rpc(
        { jsonrpc: "2.0", id: 10 + pagina, method: "tools/call", params: { name: "search_realty_listings", arguments: { filters: filtros, page: pagina, pageSize: 15 } } },
        sessao,
      );
      if (!resp.ok) return { ok: false, motivo: `MCP busca HTTP ${resp.status}`, causa: "indisponivel", vistos, anuncios: achados };
      const env = lerCorpo(await resp.text()) as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message?: string } };
      if (env.error || env.result?.isError) return { ok: false, motivo: `MCP erro: ${env.error?.message ?? "isError"}`, causa: "indisponivel", vistos, anuncios: achados };
      const texto = env.result?.content?.[0]?.text;
      const dados = (texto ? JSON.parse(texto) : {}) as Pagina;
      const lista = dados.results ?? [];
      if (!lista.length) break;
      vistos += lista.length;
      let temOutroBairro = false;
      for (const x of lista) {
        const preco = Number(x.priceBRL);
        const area = Number(x.areaM2);
        const bairro = String((x.location as { neighborhood?: string } | undefined)?.neighborhood ?? "");
        if (!(preco > 0) || !(area > 0)) continue;
        if (comBairro && !bairroConfere(e.bairro!, bairro)) {
          temOutroBairro = true;
          continue;
        }
        achados.push({
          titulo: String(x.title ?? "Anúncio"), preco, area, bairro,
          precoM2: Math.round((preco / area) * 100) / 100,
          url: typeof x.url === "string" && /^https?:\/\//i.test(x.url) ? x.url : undefined,
        });
      }
      // O servidor lista primeiro os anúncios do bairro pedido e só depois os "vizinhos" (testado em 12/10/2026):
      // quando aparece anúncio de outro bairro, as próximas páginas só trariam mais vizinhos, então paramos.
      // Na busca da cidade lemos todas as páginas permitidas: os anúncios de cada bairro são reaproveitados pelo chamador
      // (uma ida à rede alimenta vários bairros), então vale ler um pouco mais.
      if (temOutroBairro || (comBairro && achados.length >= meta * 2) || lista.length < 15) break;
    }

    if (achados.length < meta) {
      return {
        ok: false,
        motivo: `só ${achados.length} anúncio(s) ${comBairro ? `do bairro "${e.bairro}"` : "da cidade"} em ${vistos} vistos (mínimo ${meta})`,
        causa: "insuficiente",
        vistos,
        anuncios: achados,
      };
    }
    const r = resumir(achados);
    if (!r || r.usados.length < meta) return { ok: false, motivo: "anúncios muito dispersos para uma mediana confiável", causa: "insuficiente", vistos, anuncios: achados };
    const maisParecidos = [...r.usados].sort((a, b) => Math.abs(a.area - e.area) - Math.abs(b.area - e.area)).slice(0, 6);
    return { ok: true, precoM2: r.precoM2, p25: r.p25, p75: r.p75, amostras: maisParecidos, total: r.usados.length, escopo: comBairro ? "bairro" : "cidade", anuncios: achados };
  } catch (err) {
    return { ok: false, motivo: `MCP falhou: ${err instanceof Error ? err.message : String(err)}`, causa: "indisponivel", vistos: 0, anuncios: [] };
  }
}
