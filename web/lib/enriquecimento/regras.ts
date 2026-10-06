/** Regras puras do enriquecimento sob demanda (sem banco, sem rede): quando buscar, como ler a página,
 * como limpar o que a IA devolveu e como juntar com o que as fontes já disseram.
 * Fica sem imports do site (`@/...`) para rodar direto no `node --test`. A parte com banco e rede está em ./index.ts.
 */

export const LIMITE_TEXTO = 14_000;
export const MAX_LINKS = 60;
/** Depois disso a página é lida de novo (barato: se o texto não mudou, a IA não é chamada). */
export const REVALIDAR_DIAS = 7;
/** Tentativa que falhou só é repetida depois disso (não martela um site fora do ar a cada visita). */
export const REPETIR_FALHA_MIN = 60;
/** Tentativa "em andamento" há mais tempo que isso é considerada perdida (a função caiu no meio). */
export const EM_ANDAMENTO_EXPIRA_MIN = 3;

// ───────────────────────────── quando enriquecer ─────────────────────────────

export type LoteParaEnriquecer = {
  url: string | null;
  status: string;
  ocupacao: string;
  debitos_por_conta: string;
  edital_url: string | null;
  aceita_fgts: boolean | null;
  aceita_parcelamento: boolean | null;
};
export type ImovelParaEnriquecer = { matricula: string | null };
export type EstadoEnriquecimento = {
  estado: "em_andamento" | "ok" | "falhou";
  tentado_em: string | Date;
  atualizado_em: string | Date | null;
};

const minutos = (de: string | Date, agora: Date) => (+agora - +new Date(de)) / 60_000;

/** Quantos dos campos que mais pesam na decisão ainda estão em branco. */
export function lacunas(l: LoteParaEnriquecer, im: ImovelParaEnriquecer): number {
  return [
    l.ocupacao === "nao_informado",
    l.debitos_por_conta === "nao_informado",
    !l.edital_url,
    !im.matricula,
    l.aceita_fgts == null,
    l.aceita_parcelamento == null,
  ].filter(Boolean).length;
}

/** Vale a pena (e é seguro) buscar agora? A trava de assinante é checada por quem chama, antes disto. */
export function precisaEnriquecer(
  l: LoteParaEnriquecer,
  im: ImovelParaEnriquecer,
  atual: EstadoEnriquecimento | null,
  agora = new Date(),
): boolean {
  if (!l.url || !/^https?:\/\//i.test(l.url)) return false;
  if (l.status !== "ativo" && l.status !== "suspenso") return false; // encerrado não gasta IA
  if (lacunas(l, im) === 0) return false;
  if (!atual) return true;
  if (atual.estado === "ok") return !atual.atualizado_em || minutos(atual.atualizado_em, agora) > REVALIDAR_DIAS * 1440;
  if (atual.estado === "falhou") return minutos(atual.tentado_em, agora) > REPETIR_FALHA_MIN;
  return minutos(atual.tentado_em, agora) > EM_ANDAMENTO_EXPIRA_MIN; // em_andamento
}

// ───────────────────────────── ler a página ─────────────────────────────

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª" };

function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Reduz o HTML ao texto que importa (mesma ideia do `texto_principal` do coletor). */
export function htmlParaTexto(html: string): string {
  const semBlocos = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|header|footer|nav|form|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/table|\/section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodificarEntidades(semBlocos)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, LIMITE_TEXTO);
}

/** Charset da página: cabeçalho HTTP primeiro, depois <meta>. Sites públicos brasileiros antigos ainda usam Latin-1. */
export function detectarCharset(contentType: string | null, inicioComoLatin1: string): string {
  const doCabecalho = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const doMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicioComoLatin1)?.[1];
  const nome = (doCabecalho ?? doMeta ?? "utf-8").toLowerCase();
  return nome === "iso-8859-1" || nome === "latin1" ? "windows-1252" : nome;
}

export type Link = { texto: string; url: string };

const RE_LINK_UTIL = /edital|leil[aã]o|leiloeiro|lote|certid|matr[ií]cula|laudo|\.pdf|processo|document/i;

/** Links da página (texto + endereço absoluto), com os que parecem úteis primeiro. A IA escolhe por número: ela nunca digita endereço. */
export function extrairLinks(html: string, base: string, max = MAX_LINKS): Link[] {
  const vistos = new Set<string>();
  const todos: Link[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    let url: URL;
    try {
      url = new URL(decodificarEntidades(m[1]).trim(), base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    const endereco = url.toString();
    if (vistos.has(endereco)) continue;
    vistos.add(endereco);
    const texto = decodificarEntidades(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 80);
    todos.push({ texto, url: endereco });
  }
  const uteis = todos.filter((l) => RE_LINK_UTIL.test(l.texto) || RE_LINK_UTIL.test(l.url));
  const resto = todos.filter((l) => !uteis.includes(l));
  return [...uteis, ...resto].slice(0, max);
}

// ───────────────────────────── segurança da busca (SSRF) ─────────────────────────────
// O endereço da página do leiloeiro vem de uma página de terceiro. Antes de o servidor abrir qualquer
// endereço assim, ele precisa ser público: nada de localhost, rede interna ou serviço de metadados da nuvem.

export function ipPrivado(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const baixo = ip.toLowerCase();
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(baixo);
  if (mapeado) return ipPrivado(mapeado[1]);
  return baixo === "::1" || baixo === "::" || /^f[cd]/.test(baixo) || /^fe[89ab]/.test(baixo);
}

/** Checagem que não precisa de rede: protocolo, porta, usuário/senha e nomes claramente internos ou IP direto. */
export function urlPublicaSegura(texto: string): URL | null {
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || /\.(local|localhost|internal|lan|home|corp)$/.test(h)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h.startsWith("[")) return null; // IP direto: não
  return u;
}

// ───────────────────────────── o que a IA devolve ─────────────────────────────

export type Extracao = {
  eh_pagina_do_imovel: boolean;
  ocupacao?: "ocupado" | "desocupado" | "nao_informado";
  debitos_por_conta?: "vendedor" | "arrematante" | "nao_informado";
  valor_iptu_atrasado?: number;
  valor_condominio_atrasado?: number;
  valor_dividas_total?: number;
  processo?: string;
  matricula?: string;
  cartorio?: string;
  area_privativa?: number;
  area_total?: number;
  area_terreno?: number;
  quartos?: number;
  vagas?: number;
  data_praca1?: string;
  valor_praca1?: number;
  data_praca2?: string;
  valor_praca2?: number;
  aceita_financiamento?: boolean;
  aceita_fgts?: boolean;
  aceita_parcelamento?: boolean;
  forma_pagamento?: string;
  comissao_leiloeiro_pct?: number;
  leiloeiro?: string;
  resumo?: string;
  riscos?: string[];
  /** Endereços: só ficam no servidor (a tela usa /ir/). Vêm da lista de links da página, nunca digitados pela IA. */
  edital_url?: string;
  url_leiloeiro?: string;
};

const texto = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
};
const numero = (v: unknown, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;
const inteiro = (v: unknown, max: number): number | undefined => {
  const n = numero(v, max);
  return n === undefined ? undefined : Math.round(n);
};
const booleano = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const dataIso = (v: unknown): string | undefined => {
  const s = texto(v, 25);
  return s && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(s) && !Number.isNaN(+new Date(s)) ? s : undefined;
};
const escolha = <T extends string>(v: unknown, validos: readonly T[]): T | undefined =>
  typeof v === "string" && (validos as readonly string[]).includes(v) ? (v as T) : undefined;

const REAIS_MAX = 100_000_000;

/** Aceita só o que tem o formato esperado; o resto é descartado. A IA lê texto de terceiros, então nada do que ela devolve é confiável. */
export function normalizarExtracao(bruto: unknown, links: Link[]): Extracao {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const porIndice = (v: unknown) => {
    const i = typeof v === "number" && Number.isInteger(v) ? v : -1;
    return i >= 0 && i < links.length ? links[i].url : undefined;
  };
  const riscos = Array.isArray(r.riscos)
    ? [...new Set(r.riscos.map((x) => texto(x, 140)).filter((x): x is string => !!x))].slice(0, 8)
    : undefined;
  const saida: Extracao = {
    eh_pagina_do_imovel: r.eh_pagina_do_imovel === true,
    ocupacao: escolha(r.ocupacao, ["ocupado", "desocupado", "nao_informado"] as const),
    debitos_por_conta: escolha(r.debitos_por_conta, ["vendedor", "arrematante", "nao_informado"] as const),
    valor_iptu_atrasado: numero(r.valor_iptu_atrasado, REAIS_MAX),
    valor_condominio_atrasado: numero(r.valor_condominio_atrasado, REAIS_MAX),
    valor_dividas_total: numero(r.valor_dividas_total, REAIS_MAX),
    processo: texto(r.processo, 60),
    matricula: texto(r.matricula, 40),
    cartorio: texto(r.cartorio, 120),
    area_privativa: numero(r.area_privativa, 1_000_000),
    area_total: numero(r.area_total, 1_000_000),
    area_terreno: numero(r.area_terreno, 100_000_000),
    quartos: inteiro(r.quartos, 50),
    vagas: inteiro(r.vagas, 50),
    data_praca1: dataIso(r.data_praca1),
    valor_praca1: numero(r.valor_praca1, REAIS_MAX),
    data_praca2: dataIso(r.data_praca2),
    valor_praca2: numero(r.valor_praca2, REAIS_MAX),
    aceita_financiamento: booleano(r.aceita_financiamento),
    aceita_fgts: booleano(r.aceita_fgts),
    aceita_parcelamento: booleano(r.aceita_parcelamento),
    forma_pagamento: texto(r.forma_pagamento, 300),
    comissao_leiloeiro_pct: numero(r.comissao_leiloeiro_pct, 30),
    leiloeiro: texto(r.leiloeiro, 120),
    resumo: texto(r.resumo, 500),
    riscos: riscos?.length ? riscos : undefined,
    edital_url: porIndice(r.indice_link_edital),
    url_leiloeiro: porIndice(r.indice_link_leiloeiro),
  };
  for (const k of Object.keys(saida) as (keyof Extracao)[]) if (saida[k] === undefined) delete saida[k];
  return saida;
}

const vazio = (v: unknown) => v === undefined || v === null || v === "nao_informado";

/** Junta duas leituras (ex.: página da Caixa + página do leiloeiro). A segunda tem prioridade, exceto onde
 * o conservador deve prevalecer: se uma das duas diz "ocupado", fica "ocupado"; se uma diz que as dívidas
 * ficam com o arrematante, fica com o arrematante. */
export function mesclarExtracoes(a: Extracao, b: Extracao): Extracao {
  const saida: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) if (!vazio(v)) saida[k] = v;
  if (a.ocupacao === "ocupado" || b.ocupacao === "ocupado") saida.ocupacao = "ocupado";
  if (a.debitos_por_conta === "arrematante" || b.debitos_por_conta === "arrematante") saida.debitos_por_conta = "arrematante";
  const riscos = [...new Set([...(a.riscos ?? []), ...(b.riscos ?? [])])].slice(0, 8);
  if (riscos.length) saida.riscos = riscos;
  saida.eh_pagina_do_imovel = a.eh_pagina_do_imovel || b.eh_pagina_do_imovel;
  return saida as Extracao;
}

/** Resultado novo e incompleto (uma das páginas não pôde ser lida agora): o que não veio é completado com o que já se sabia,
 * em vez de apagado. Valores que vieram valem mais que os antigos. */
export function completarCom(anterior: Extracao | null | undefined, novo: Extracao): Extracao {
  if (!anterior) return novo;
  const saida: Record<string, unknown> = { ...anterior };
  for (const [k, v] of Object.entries(novo)) if (!vazio(v)) saida[k] = v;
  const riscos = [...new Set([...(novo.riscos ?? []), ...(anterior.riscos ?? [])])].slice(0, 8);
  if (riscos.length) saida.riscos = riscos;
  return saida as Extracao;
}

export type Condicoes = {
  ocupacao: string;
  debitos: string;
  fgts: boolean | null;
  financiamento: boolean | null;
  parcelamento: boolean | null;
};

/** O que a fonte do lote já afirmou nunca é trocado: o enriquecimento só preenche o que estava em branco. */
export function aplicarEnriquecimento(base: Condicoes, e: Extracao | null | undefined): Condicoes {
  if (!e) return base;
  return {
    ocupacao: base.ocupacao === "nao_informado" && !vazio(e.ocupacao) ? e.ocupacao! : base.ocupacao,
    debitos: base.debitos === "nao_informado" && !vazio(e.debitos_por_conta) ? e.debitos_por_conta! : base.debitos,
    fgts: base.fgts ?? e.aceita_fgts ?? null,
    financiamento: base.financiamento ?? e.aceita_financiamento ?? null,
    parcelamento: base.parcelamento ?? e.aceita_parcelamento ?? null,
  };
}
