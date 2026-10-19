/**
 * Núcleo do "valor de mercado": preço por m² de ANÚNCIOS de venda parecidos na região (nunca dos editais, que é
 * justamente o que queremos comparar). Sem rede nem banco aqui dentro: tudo que toca o mundo entra por `Dependencias`,
 * então a calculadora, o pré-cálculo semanal e os testes usam exatamente a mesma lógica.
 *
 * Ordem, da mais barata para a mais cara. Cada degrau só roda se o anterior não resolveu:
 *   1) banco (`mercado_preco`): linha do bairro, depois da cidade, ainda dentro da validade. Custo zero;
 *   2) Chaves na Mão (servidor MCP público), sem IA, no bairro. Se faltar anúncio, a tentativa vazia fica guardada
 *      (7 dias) para ninguém repetir a consulta;
 *   3) Chaves na Mão na cidade inteira. Uma ida à rede alimenta também os outros bairros que apareceram com anúncios
 *      suficientes (reaproveitamento), e a cidade serve de resposta para qualquer bairro sem dado próprio;
 *   4) IA com busca na web, SÓ se quem chamou permitir (clique de assinante), houver chave e o teto diário permitir.
 * Tudo que dá certo é gravado: a próxima pessoa na mesma região (e a ficha do imóvel) lê do banco.
 */
import {
  buscarNoChaves,
  MINIMO_BAIRRO,
  resumir,
  type AnuncioMcp,
  type ResultadoMcp,
} from "./mercadoMcp.ts";
import { buscarNaWeb, chaveIA, MINIMO_IA } from "./mercadoIA.ts";

export type Escopo = "bairro" | "cidade";
export type Fonte = "chaves-na-mao" | "ia";
export type Confianca = "alta" | "media" | "baixa";

export type EntradaMercado = {
  uf: string;
  cidade: string;
  bairro?: string | null;
  tipo: string; // apartamento | casa | terreno | comercial | galpao | rural | vaga | outros
  area: number;
};

export type AmostraMercado = { titulo: string; preco: number; area: number; precoM2: number; url?: string };

export type Estimativa = {
  /** mediana de R$/m² dos anúncios */
  precoM2: number;
  /** intervalo típico (p25 e p75): "cauteloso" e "otimista" */
  baixo: number;
  alto: number;
  n: number;
  escopo: Escopo;
  fonte: Fonte;
  confianca: Confianca;
  amostras: AmostraMercado[];
  coletadoEm: string; // ISO
  observacao: string;
};

export type ResultadoMercado = ({ ok: true } & Estimativa) | { ok: false; erro: string };

// ───────────────────────────── chave da região ─────────────────────────────

export const LIMITES_AREA = [0, 30, 45, 60, 80, 100, 130, 170, 250, 400, 700, 1500, 5000, Infinity];

/** Agrupa áreas parecidas na mesma faixa: imóveis de tamanho próximo reaproveitam o mesmo resultado. */
export function faixaDeArea(area: number): { min: number; max: number } {
  const i = LIMITES_AREA.findIndex((lim, k) => area >= lim && area < LIMITES_AREA[k + 1]);
  const min = LIMITES_AREA[Math.max(i, 0)];
  const max = LIMITES_AREA[Math.max(i, 0) + 1];
  return { min: Math.max(Math.round(min * 0.85), 10), max: Number.isFinite(max) ? Math.round(max * 1.15) : Math.round(min * 2) };
}

export function normalizarChave(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "-");
}

/** "Taguatinga Sul (Taguatinga)" e "Taguatinga Sul" viram a mesma chave. */
const chaveBairroDoAnuncio = (b: string) => normalizarChave(b.replace(/\(.*?\)/g, ""));

export type ChaveRegiao = { uf: string; cidadeChave: string; bairroChave: string; tipo: string; faixaMin: number; faixaMax: number };

export function chaveDe(e: EntradaMercado): ChaveRegiao {
  const faixa = faixaDeArea(e.area);
  return {
    uf: e.uf.toUpperCase(),
    cidadeChave: normalizarChave(e.cidade),
    bairroChave: e.bairro?.trim() ? normalizarChave(e.bairro) : "",
    tipo: e.tipo,
    faixaMin: faixa.min,
    faixaMax: faixa.max,
  };
}

// ───────────────────────────── armazém e dependências ─────────────────────────────

export type LinhaMercado = ChaveRegiao & {
  escopo: Escopo;
  fonte: Fonte;
  precoM2: number | null; // nulo = tentativa sem resultado
  p25: number | null;
  p75: number | null;
  n: number;
  motivo: string | null;
  amostras: AmostraMercado[];
  coletadoEm: string | Date;
};

export interface ArmazemMercado {
  /** Linha mais recente do bairro (se a chave tem bairro) e da cidade, numa só consulta. */
  ler(chave: ChaveRegiao): Promise<{ bairro: LinhaMercado | null; cidade: LinhaMercado | null }>;
  gravar(linhas: LinhaMercado[]): Promise<void>;
  /** Reserva uma chamada de IA do dia; false se o teto foi atingido. */
  reservarIA(): Promise<boolean>;
}

export type Dependencias = {
  armazem: ArmazemMercado;
  /** A IA só entra quando uma pessoa pediu (clique) e é assinante. O pré-cálculo nunca permite. */
  permitirIA: boolean;
  agora?: () => number;
  buscarMcp?: typeof buscarNoChaves;
  buscarIA?: typeof buscarNaWeb;
  pausa?: (ms: number) => Promise<void>;
  /** Validade em dias do que está no banco. O pré-cálculo usa uma validade menor para renovar antes de vencer. */
  validade?: Validade;
};

export const VALIDADE_DIAS = 30; // preço por m² de uma região muda devagar
export const VALIDADE_TENTATIVA_DIAS = 7; // "não havia anúncios": tenta de novo na semana seguinte
export const REVALIDAR_ANTES_DIAS = 25; // o pré-cálculo renova o que vence em até 5 dias, antes de alguém precisar

const DIA_MS = 86_400_000;

export function idadeEmDias(l: { coletadoEm: string | Date }, agora: number): number {
  return (agora - new Date(l.coletadoEm).getTime()) / DIA_MS;
}

export type Validade = { preco: number; tentativa: number };
const VALIDADE_PADRAO: Validade = { preco: VALIDADE_DIAS, tentativa: VALIDADE_TENTATIVA_DIAS };

function fresca(l: LinhaMercado | null, agora: number, lim: Validade = VALIDADE_PADRAO): l is LinhaMercado {
  if (!l) return false;
  return idadeEmDias(l, agora) < (l.precoM2 != null ? lim.preco : lim.tentativa);
}

// ───────────────────────────── estatística ─────────────────────────────

/**
 * Quanto confiar no número. Bairro com muitos anúncios e pouca dispersão é "alta"; a cidade inteira mistura bairros
 * de preços diferentes, então nunca passa de "média"; a IA (poucos anúncios, escolhidos pelo modelo) é sempre "baixa".
 */
export function classificarConfianca(x: { escopo: Escopo; fonte: Fonte; n: number; p25: number; mediana: number; p75: number }): Confianca {
  if (x.fonte === "ia") return "baixa";
  const dispersao = x.mediana > 0 ? (x.p75 - x.p25) / x.mediana : 1;
  if (x.escopo === "bairro") {
    if (x.n >= 15 && dispersao <= 0.35) return "alta";
    if (x.n >= MINIMO_BAIRRO && dispersao <= 0.6) return "media";
    return "baixa";
  }
  if (x.n >= 30 && dispersao <= 0.4) return "media";
  return "baixa";
}

function amostrasParecidas(usados: AnuncioMcp[], areaAlvo: number): AmostraMercado[] {
  return [...usados]
    .sort((a, b) => Math.abs(a.area - areaAlvo) - Math.abs(b.area - areaAlvo))
    .slice(0, 6)
    .map((a) => ({ titulo: a.titulo, preco: a.preco, area: a.area, precoM2: a.precoM2, url: a.url }));
}

function linhaOk(c: ChaveRegiao, bairroChave: string, escopo: Escopo, fonte: Fonte, usados: AnuncioMcp[], r: { precoM2: number; p25: number; p75: number }, areaAlvo: number, agora: number): LinhaMercado {
  return { ...c, bairroChave, escopo, fonte, precoM2: r.precoM2, p25: r.p25, p75: r.p75, n: usados.length, motivo: null, amostras: amostrasParecidas(usados, areaAlvo), coletadoEm: new Date(agora).toISOString() };
}

function linhaVazia(c: ChaveRegiao, bairroChave: string, escopo: Escopo, fonte: Fonte, motivo: string, agora: number): LinhaMercado {
  return { ...c, bairroChave, escopo, fonte, precoM2: null, p25: null, p75: null, n: 0, motivo: motivo.slice(0, 300), amostras: [], coletadoEm: new Date(agora).toISOString() };
}

/**
 * Anúncios lidos na cidade inteira → uma linha para cada bairro que, só com seus anúncios, atinge o mínimo.
 * É o reaproveitamento: a mesma ida à rede deixa vários bairros prontos para a próxima pesquisa (ou para o pré-cálculo).
 */
export function linhasPorBairro(c: ChaveRegiao, anuncios: AnuncioMcp[], areaAlvo: number, agora: number, excluir: string): LinhaMercado[] {
  const grupos = new Map<string, AnuncioMcp[]>();
  for (const a of anuncios) {
    const k = chaveBairroDoAnuncio(a.bairro);
    if (!k || k === excluir) continue;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(a);
  }
  const linhas: LinhaMercado[] = [];
  for (const [k, lista] of grupos) {
    if (lista.length < MINIMO_BAIRRO) continue;
    const r = resumir(lista);
    if (!r || r.usados.length < MINIMO_BAIRRO) continue;
    linhas.push(linhaOk(c, k, "bairro", "chaves-na-mao", r.usados, r, areaAlvo, agora));
  }
  return linhas;
}

// ───────────────────────────── resposta ─────────────────────────────

function paraResultado(l: LinhaMercado, e: EntradaMercado): ResultadoMercado {
  const precoM2 = l.precoM2!;
  const p25 = l.p25 ?? precoM2;
  const p75 = l.p75 ?? precoM2;
  const pediuBairro = !!e.bairro?.trim();
  const origem = l.fonte === "ia" ? "Busca automática na web" : "Chaves na Mão";
  let observacao: string;
  if (l.fonte === "ia") {
    observacao = `Estimativa por busca automática na web (${l.n} anúncios). Confira os links antes de decidir.`;
  } else if (l.escopo === "bairro") {
    observacao = `Mediana de ${l.n} anúncios de venda no bairro ${e.bairro} (${origem}, preços pedidos).`;
  } else {
    observacao = `${pediuBairro ? `Poucos anúncios no bairro ${e.bairro}; usamos a cidade de ${e.cidade}. ` : ""}Mediana de ${l.n} anúncios de venda em ${e.cidade} (${origem}, preços pedidos).`;
  }
  return {
    ok: true,
    precoM2,
    baixo: Math.min(p25, precoM2),
    alto: Math.max(p75, precoM2),
    n: l.n,
    escopo: l.escopo,
    fonte: l.fonte,
    confianca: classificarConfianca({ escopo: l.escopo, fonte: l.fonte, n: l.n, p25, mediana: precoM2, p75 }),
    amostras: l.amostras,
    coletadoEm: new Date(l.coletadoEm).toISOString(),
    observacao,
  };
}

/** Só leitura: o que já está no banco para essa região, sem rede (ficha do imóvel). Bairro primeiro, depois a cidade. */
export async function estimativaGuardada(e: EntradaMercado, armazem: ArmazemMercado, agora = Date.now()): Promise<ResultadoMercado | null> {
  if (!e.uf || !e.cidade || !(e.area > 0)) return null;
  const { bairro, cidade } = await armazem.ler(chaveDe(e));
  for (const l of [bairro, cidade]) if (fresca(l, agora) && l.precoM2 != null) return paraResultado(l, e);
  return null;
}

function erroSemAnuncios(): ResultadoMercado {
  return { ok: false, erro: "Não há anúncios suficientes para estimar o preço por m² dessa região." };
}

export async function estimarMercado(e: EntradaMercado, dep: Dependencias): Promise<ResultadoMercado> {
  if (!e.uf || !e.cidade || !e.area || e.area <= 0) {
    return { ok: false, erro: "Informe estado, cidade e área do imóvel para pesquisar." };
  }
  const agora = (dep.agora ?? Date.now)();
  const lim = dep.validade ?? VALIDADE_PADRAO;
  const f = (l: LinhaMercado | null): l is LinhaMercado => fresca(l, agora, lim);
  const mcp = dep.buscarMcp ?? buscarNoChaves;
  const ia = dep.buscarIA ?? buscarNaWeb;
  const semMcp = process.env.MERCADO_SEM_MCP === "1";
  const faixa = faixaDeArea(e.area);
  const chave = chaveDe(e);
  const comBairro = chave.bairroChave !== "";
  const guardar = (linhas: LinhaMercado[]) => dep.armazem.gravar(linhas);
  const busca = (bairro: string | null) => mcp({ ...e, bairro }, faixa, dep.pausa);

  // 1) banco
  const { bairro: lb, cidade: lc } = await dep.armazem.ler(chave);
  if (comBairro && f(lb) && lb.precoM2 != null) return paraResultado(lb, e);
  const bairroJaTentado = comBairro && f(lb); // tentativa vazia ainda válida: não repete a consulta
  const cidadeComDado = f(lc) && lc.precoM2 != null;
  const cidadeJaTentada = f(lc);

  let mcpFora = semMcp; // portal fora do ar ou tipo sem cobertura: pular as demais consultas a ele, ir direto à reserva
  let semCobertura = false;

  // 2) bairro, sem IA
  if (comBairro && !bairroJaTentado && !mcpFora) {
    const r = await busca(e.bairro!);
    if (r.ok) {
      const linha = linhaOk(chave, chave.bairroChave, "bairro", "chaves-na-mao", resumirUsados(r), r, e.area, agora);
      await guardar([linha]);
      return paraResultado(linha, e);
    }
    console.info(`[mercado] bairro ${e.bairro}: ${r.motivo}`);
    if (r.causa === "insuficiente") await guardar([linhaVazia(chave, chave.bairroChave, "bairro", "chaves-na-mao", r.motivo, agora)]);
    else mcpFora = true;
    semCobertura = r.causa === "sem_cobertura";
  }

  // 3) cidade, sem IA
  if (cidadeComDado && !semCobertura) return paraResultado(lc!, e);
  if (!cidadeJaTentada && !mcpFora) {
    const r = await busca(null);
    if (r.ok) {
      const linhaCidade = linhaOk(chave, "", "cidade", "chaves-na-mao", resumirUsados(r), r, e.area, agora);
      const derivadas = linhasPorBairro(chave, r.anuncios, e.area, agora, chave.bairroChave);
      await guardar([linhaCidade, ...derivadas]);
      return paraResultado(linhaCidade, e);
    }
    console.info(`[mercado] cidade ${e.cidade}: ${r.motivo}`);
    if (r.causa === "insuficiente") {
      // mesmo sem mediana da cidade, os bairros que atingiram o mínimo ficam guardados para as próximas pesquisas
      const derivadas = linhasPorBairro(chave, r.anuncios, e.area, agora, chave.bairroChave);
      await guardar([linhaVazia(chave, "", "cidade", "chaves-na-mao", r.motivo, agora), ...derivadas]);
    } else mcpFora = true;
    semCobertura = semCobertura || r.causa === "sem_cobertura";
  }

  // 4) IA: último recurso, só com pedido de assinante, chave e teto diário
  if (!dep.permitirIA) return erroSemAnuncios();
  if (!chaveIA()) return erroSemAnuncios();
  const escopoIA: Escopo = comBairro ? "bairro" : "cidade";
  const bairroChaveIA = comBairro ? chave.bairroChave : "";
  const linhaIA = comBairro ? lb : lc;
  if (f(linhaIA) && linhaIA.fonte === "ia") return erroSemAnuncios(); // a IA já tentou essa região e não achou nada
  if (!(await dep.armazem.reservarIA())) {
    return { ok: false, erro: "Não há anúncios suficientes nas fontes gratuitas, e a busca avançada atingiu o limite de hoje. Tente amanhã ou informe o m² manualmente." };
  }
  const local = [e.bairro, e.cidade, e.uf].filter(Boolean).join(", ");
  const r = await ia(e, faixa, local);
  if (!r.ok) {
    if (r.vazio) await guardar([linhaVazia(chave, bairroChaveIA, escopoIA, "ia", r.erro, agora)]);
    return { ok: false, erro: r.erro };
  }
  const resumo = resumir(r.anuncios);
  if (!resumo || resumo.usados.length < MINIMO_IA) {
    await guardar([linhaVazia(chave, bairroChaveIA, escopoIA, "ia", "poucos anúncios úteis na busca", agora)]);
    return { ok: false, erro: "Não encontrei anúncios parecidos o bastante para estimar um preço por m². Tente com outra cidade ou bairro." };
  }
  const linha = linhaOk(chave, bairroChaveIA, escopoIA, "ia", resumo.usados, resumo, e.area, agora);
  await guardar([linha]);
  return paraResultado(linha, e);
}

/** Os anúncios que de fato entraram na mediana (sem os valores absurdos). */
function resumirUsados(r: Extract<ResultadoMcp, { ok: true }>): AnuncioMcp[] {
  return resumir(r.anuncios)?.usados ?? [];
}
