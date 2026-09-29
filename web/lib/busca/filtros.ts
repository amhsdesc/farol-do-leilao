// Filtros da busca: leitura da URL, trava de assinante e montagem do SQL.
// Código puro (sem banco), para poder testar com node:test.

import { MODALIDADES as MODALIDADES_ROTULO, TIPOS as TIPOS_ROTULO } from "../formato.ts";

export type Filtros = {
  // livres para todo mundo: é a busca pelo mapa
  bbox?: [number, number, number, number]; // oeste, sul, leste, norte
  pagina: number;
  // só assinantes
  uf?: string;
  cidade?: string;
  raio_km?: number;
  centro?: [number, number]; // lat, lon
  comitente?: string[];
  modalidade?: string[];
  leiloeiro?: string;
  lance_min?: number;
  lance_max?: number;
  desconto_min?: number; // em %
  m2_max?: number;
  fgts?: boolean;
  financiamento?: boolean;
  parcelamento?: boolean;
  prazo_dias?: number;
  so_2a_praca?: boolean;
  novos?: boolean;
  tipo?: string[];
  quartos_min?: number;
  vagas_min?: number;
  area_min?: number;
  area_max?: number;
  desocupado?: boolean;
  sem_dividas?: boolean;
  preco_caiu?: boolean;
  varias_fontes?: boolean;
  com_fotos?: boolean;
  ordem?: string;
};

export const CAMPOS_ASSINANTE = [
  "uf", "cidade", "raio_km", "centro", "comitente", "modalidade", "leiloeiro", "lance_min", "lance_max",
  "desconto_min", "m2_max", "fgts", "financiamento", "parcelamento", "prazo_dias", "so_2a_praca", "novos",
  "tipo", "quartos_min", "vagas_min", "area_min", "area_max", "desocupado", "sem_dividas", "preco_caiu",
  "varias_fontes", "com_fotos", "ordem",
] as const satisfies readonly (keyof Filtros)[];

export const ORDENS: Record<string, string> = {
  desconto: "desconto_avaliacao desc nulls last",
  preco: "lance_minimo asc nulls last",
  leilao: "coalesce(data_leilao, 'infinity') asc",
  recentes: "primeiro_visto_em desc",
  m2: "preco_m2 asc nulls last",
};
export const ORDEM_PADRAO = "desconto";

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const TIPOS = new Set(["apartamento", "casa", "terreno", "comercial", "galpao", "rural", "vaga", "outros"]);
const MODALIDADES = new Set(["judicial", "extrajudicial", "venda_direta", "licitacao", "outros"]);

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function pegar(e: Entrada, k: string): string | undefined {
  const v = e instanceof URLSearchParams ? e.get(k) : e[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s == null || s.trim() === "" ? undefined : s.trim().slice(0, 120);
}
function numero(e: Entrada, k: string, min = 0, max = 1e10): number | undefined {
  const s = pegar(e, k);
  if (s == null) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}
function sim(e: Entrada, k: string): boolean | undefined {
  const s = pegar(e, k);
  return s === "1" || s === "sim" || s === "true" ? true : undefined;
}
function lista(e: Entrada, k: string, validos?: Set<string>): string[] | undefined {
  const s = pegar(e, k);
  if (!s) return undefined;
  const itens = s.split(",").map((x) => x.trim()).filter((x) => x && (!validos || validos.has(x))).slice(0, 20);
  return itens.length ? itens : undefined;
}

/** Lê os filtros da URL, descartando valores inválidos. */
export function lerFiltros(e: Entrada): Filtros {
  const f: Filtros = { pagina: Math.floor(numero(e, "pagina", 1, 500) ?? 1) };
  const b = pegar(e, "bbox")?.split(",").map(Number);
  if (b && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3]) {
    f.bbox = b as [number, number, number, number];
  }
  const uf = pegar(e, "uf")?.toUpperCase();
  if (uf && UFS.has(uf)) f.uf = uf;
  f.cidade = pegar(e, "cidade");
  f.raio_km = numero(e, "raio_km", 1, 300);
  const c = pegar(e, "centro")?.split(",").map(Number);
  if (c && c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180) {
    f.centro = [c[0], c[1]];
  }
  if (!f.centro) f.raio_km = undefined;
  f.comitente = lista(e, "comitente");
  f.modalidade = lista(e, "modalidade", MODALIDADES);
  f.leiloeiro = pegar(e, "leiloeiro");
  f.lance_min = numero(e, "lance_min");
  f.lance_max = numero(e, "lance_max");
  f.desconto_min = numero(e, "desconto_min", 1, 95);
  f.m2_max = numero(e, "m2_max", 1);
  f.fgts = sim(e, "fgts");
  f.financiamento = sim(e, "financiamento");
  f.parcelamento = sim(e, "parcelamento");
  f.prazo_dias = numero(e, "prazo_dias", 1, 365);
  f.so_2a_praca = sim(e, "so_2a_praca");
  f.novos = sim(e, "novos");
  f.tipo = lista(e, "tipo", TIPOS);
  f.quartos_min = numero(e, "quartos_min", 1, 10);
  f.vagas_min = numero(e, "vagas_min", 1, 10);
  f.area_min = numero(e, "area_min", 1);
  f.area_max = numero(e, "area_max", 1);
  f.desocupado = sim(e, "desocupado");
  f.sem_dividas = sim(e, "sem_dividas");
  f.preco_caiu = sim(e, "preco_caiu");
  f.varias_fontes = sim(e, "varias_fontes");
  f.com_fotos = sim(e, "com_fotos");
  const ordem = pegar(e, "ordem");
  if (ordem && ORDENS[ordem]) f.ordem = ordem;
  for (const k of Object.keys(f) as (keyof Filtros)[]) if (f[k] === undefined) delete f[k];
  return f;
}

/** Tira o que o visitante não pode usar. Devolve os nomes que foram tirados (para a tela avisar). */
export function aplicarAcesso(f: Filtros, assinante: boolean): { filtros: Filtros; bloqueados: string[] } {
  if (assinante) return { filtros: f, bloqueados: [] };
  const filtros: Filtros = { ...f };
  const bloqueados: string[] = [];
  for (const k of CAMPOS_ASSINANTE) {
    if (filtros[k] !== undefined) {
      bloqueados.push(k);
      delete filtros[k];
    }
  }
  return { filtros, bloqueados };
}

/** Quantos filtros de assinante estão ligados (para o contador do botão "Filtros"). */
export function contarFiltros(f: Filtros): number {
  return CAMPOS_ASSINANTE.filter((k) => k !== "ordem" && k !== "centro" && f[k] !== undefined).length;
}

/** Volta para a URL (o contrário de lerFiltros). */
export function paraUrl(f: Partial<Filtros>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || (k === "pagina" && v === 1)) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
    } else p.set(k, v === true ? "1" : String(v));
  }
  return p;
}

/** Monta o WHERE sobre vw_busca. `usarBbox` = false para os pontos do mapa (o mapa mostra tudo). */
export function montarWhere(f: Filtros, usarBbox = true): { where: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (usarBbox && f.bbox) {
    const [o, s, l, n] = f.bbox;
    cond.push(`lon between ${p(o)} and ${p(l)} and lat between ${p(s)} and ${p(n)}`);
  }
  if (f.uf) cond.push(`uf = ${p(f.uf)}`);
  if (f.cidade) cond.push(`unaccent(lower(cidade)) like unaccent(lower(${p(`%${f.cidade}%`)}))`);
  if (f.centro && f.raio_km) {
    cond.push(`st_dwithin(geom, st_setsrid(st_makepoint(${p(f.centro[1])}, ${p(f.centro[0])}), 4326)::geography, ${p(f.raio_km * 1000)})`);
  }
  if (f.comitente) cond.push(`comitente = any(${p(f.comitente)}::text[])`);
  if (f.modalidade) cond.push(`modalidade = any(${p(f.modalidade)}::text[])`);
  if (f.leiloeiro) cond.push(`unaccent(lower(leiloeiro)) like unaccent(lower(${p(`%${f.leiloeiro}%`)}))`);
  if (f.lance_min) cond.push(`lance_minimo >= ${p(f.lance_min)}`);
  if (f.lance_max) cond.push(`lance_minimo <= ${p(f.lance_max)}`);
  if (f.desconto_min) cond.push(`desconto_avaliacao >= ${p(f.desconto_min / 100)}`);
  if (f.m2_max) cond.push(`preco_m2 <= ${p(f.m2_max)}`);
  if (f.fgts) cond.push("aceita_fgts");
  if (f.financiamento) cond.push("aceita_financiamento");
  if (f.parcelamento) cond.push("aceita_parcelamento");
  if (f.prazo_dias) cond.push(`data_leilao between now() and now() + ${p(f.prazo_dias)} * interval '1 day'`);
  if (f.so_2a_praca) cond.push("praca_atual = 2");
  if (f.novos) cond.push("primeiro_visto_em > now() - interval '7 days'");
  if (f.tipo) cond.push(`tipo = any(${p(f.tipo)}::text[])`);
  if (f.quartos_min) cond.push(`quartos >= ${p(f.quartos_min)}`);
  if (f.vagas_min) cond.push(`vagas >= ${p(f.vagas_min)}`);
  if (f.area_min) cond.push(`area >= ${p(f.area_min)}`);
  if (f.area_max) cond.push(`area <= ${p(f.area_max)}`);
  if (f.desocupado) cond.push("ocupacao = 'desocupado'");
  if (f.sem_dividas) cond.push("debitos_por_conta = 'vendedor'");
  if (f.preco_caiu) cond.push("preco_caiu");
  if (f.varias_fontes) cond.push("n_fontes > 1");
  if (f.com_fotos) cond.push("n_fotos > 0");
  return { where: cond.length ? "where " + cond.join(" and ") : "", params };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Rótulo curto para uma busca salva, quando a pessoa não dá um nome. */
export function rotuloFiltros(f: Filtros): string {
  const partes: string[] = [];
  if (f.cidade) partes.push(f.cidade);
  else if (f.uf) partes.push(f.uf);
  if (f.tipo?.length) partes.push(f.tipo.length === 1 ? (TIPOS_ROTULO[f.tipo[0]] ?? f.tipo[0]) : `${f.tipo.length} tipos de imóvel`);
  if (f.modalidade?.length === 1) partes.push(MODALIDADES_ROTULO[f.modalidade[0]] ?? f.modalidade[0]);
  if (f.lance_max) partes.push(`até ${brl.format(f.lance_max)}`);
  if (f.desconto_min) partes.push(`${f.desconto_min}%+ de desconto`);
  return partes.length ? partes.join(", ") : "Todos os imóveis";
}
