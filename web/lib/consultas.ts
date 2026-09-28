import { consulta } from "./db";

export type ItemBusca = {
  imovel_id: number;
  tipo: string;
  uf: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  area: number | null;
  quartos: number | null;
  vagas: number | null;
  lat: number | null;
  lon: number | null;
  geo_precisao: string | null;
  lote_id: number;
  fonte_id: string;
  fonte_nome: string;
  url: string | null;
  titulo: string | null;
  modalidade: string;
  status: string;
  valor_avaliacao: number | null;
  lance_minimo: number | null;
  praca_atual: number | null;
  data_praca1: string | null;
  data_praca2: string | null;
  ocupacao: string;
  aceita_financiamento: boolean | null;
  foto: string | null;
  n_fontes: number;
  desconto_avaliacao: number | null;
  primeiro_visto_em: string;
};

export type Filtros = {
  uf?: string;
  cidade?: string;
  tipo?: string;
  modalidade?: string;
  ocupacao?: string;
  fonte?: string;
  preco_max?: string;
  desconto_min?: string;
  q?: string;
  ordem?: string;
  pagina?: string;
};

const ORDENS: Record<string, string> = {
  desconto: "desconto_avaliacao desc nulls last",
  preco: "lance_minimo asc nulls last",
  recentes: "primeiro_visto_em desc",
  praca: "coalesce(case when praca_atual = 2 then data_praca2 else data_praca1 end, 'infinity') asc",
};

export const POR_PAGINA = 40;

function montarWhere(f: Filtros): { where: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    cond.push(sql.replace("$?", `$${params.length}`));
  };
  if (f.uf) add("uf = $?", f.uf.toUpperCase());
  if (f.cidade) add("unaccent(lower(cidade)) like unaccent(lower($?))", `%${f.cidade}%`);
  if (f.tipo) add("tipo = $?", f.tipo);
  if (f.modalidade) add("modalidade = $?", f.modalidade);
  if (f.ocupacao) add("ocupacao = $?", f.ocupacao);
  if (f.fonte) add("imovel_id in (select imovel_id from lote where fonte_id = $? and status in ('ativo','suspenso'))", f.fonte);
  if (f.preco_max && Number(f.preco_max) > 0) add("lance_minimo <= $?", Number(f.preco_max));
  if (f.desconto_min && Number(f.desconto_min) > 0) add("desconto_avaliacao >= $?", Number(f.desconto_min) / 100);
  if (f.q)
    add(
      "unaccent(lower(coalesce(titulo,'') || ' ' || coalesce(endereco,'') || ' ' || coalesce(bairro,''))) like unaccent(lower($?))",
      `%${f.q}%`,
    );
  return { where: cond.length ? "where " + cond.join(" and ") : "", params };
}

export async function buscar(f: Filtros) {
  const { where, params } = montarWhere(f);
  const ordem = ORDENS[f.ordem ?? "desconto"] ?? ORDENS.desconto;
  const pagina = Math.max(1, Number(f.pagina ?? 1) || 1);
  const [itens, total, pontos] = await Promise.all([
    consulta<ItemBusca>(
      `select * from vw_busca ${where} order by ${ordem}, imovel_id limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
      params,
    ),
    consulta<{ n: number }>(`select count(*)::int n from vw_busca ${where}`, params),
    consulta<Pick<ItemBusca, "imovel_id" | "lat" | "lon" | "lance_minimo" | "tipo" | "titulo" | "desconto_avaliacao">>(
      `select imovel_id, lat, lon, lance_minimo, tipo, titulo, desconto_avaliacao from vw_busca ${where}
       ${where ? "and" : "where"} lat is not null limit 3000`,
      params,
    ),
  ]);
  return { itens, total: total[0]?.n ?? 0, pontos, pagina };
}

export async function opcoesFiltro() {
  const [ufs, fontes] = await Promise.all([
    consulta<{ uf: string; n: number }>("select uf, count(*)::int n from vw_busca where uf is not null group by uf order by uf"),
    consulta<{ id: string; nome: string; n: number }>(
      `select f.id, f.nome, count(l.*)::int n from fonte f
       left join lote l on l.fonte_id = f.id and l.status in ('ativo','suspenso')
       where f.ativa group by f.id order by n desc`,
    ),
  ]);
  return { ufs, fontes };
}

export type Lote = {
  id: number;
  fonte_id: string;
  fonte_nome: string;
  id_externo: string;
  url: string | null;
  titulo: string | null;
  descricao: string | null;
  modalidade: string;
  status: string;
  valor_avaliacao: number | null;
  lance_minimo: number | null;
  praca_atual: number | null;
  data_praca1: string | null;
  valor_praca1: number | null;
  data_praca2: string | null;
  valor_praca2: number | null;
  ocupacao: string;
  aceita_financiamento: boolean | null;
  aceita_fgts: boolean | null;
  leiloeiro: string | null;
  processo: string | null;
  edital_url: string | null;
  fotos: string[];
  primeiro_visto_em: string;
  ultimo_visto_em: string;
};

export type Imovel = {
  id: number;
  tipo: string;
  uf: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  area_privativa: number | null;
  area_total: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
  matricula: string | null;
  cartorio: string | null;
  lat: number | null;
  lon: number | null;
  geo_precisao: string | null;
};

export type Leitura = {
  lida_em: string;
  evento: string;
  fonte_nome: string;
  status: string | null;
  lance_minimo: number | null;
  praca_atual: number | null;
};

export async function imovel(id: number) {
  const [im] = await consulta<Imovel>(
    `select id, tipo, uf, cidade, bairro, endereco, area_privativa, area_total, area_terreno, quartos, vagas,
            matricula, cartorio, st_y(geom::geometry) lat, st_x(geom::geometry) lon, geo_precisao
     from imovel where id = $1`,
    [id],
  );
  if (!im) return null;
  const [lotes, historico] = await Promise.all([
    consulta<Lote>(
      `select l.*, f.nome fonte_nome from lote l join fonte f on f.id = l.fonte_id
       where l.imovel_id = $1 order by (l.status in ('ativo','suspenso')) desc, l.lance_minimo nulls last`,
      [id],
    ),
    consulta<Leitura>(
      `select le.lida_em, le.evento, f.nome fonte_nome, le.status, le.lance_minimo, le.praca_atual
       from leitura le join lote l on l.id = le.lote_id join fonte f on f.id = l.fonte_id
       where l.imovel_id = $1 order by le.lida_em desc limit 100`,
      [id],
    ),
  ]);
  return { imovel: im, lotes, historico };
}

export type LinhaFonte = {
  id: string;
  nome: string;
  site: string | null;
  tipo_adaptador: string;
  uf: string[];
  ativa: boolean;
  ativos: number;
  status: string | null;
  iniciada_em: string | null;
  lotes_novos: number | null;
  lotes_alterados: number | null;
  lotes_removidos: number | null;
  mensagem: string | null;
  execucoes_7d: number;
  falhas_7d: number;
};

export async function painelFontes() {
  return consulta<LinhaFonte>(
    `select f.id, f.nome, f.site, f.tipo_adaptador, f.uf, f.ativa,
            (select count(*)::int from lote l where l.fonte_id = f.id and l.status in ('ativo','suspenso')) ativos,
            e.status, e.iniciada_em, e.lotes_novos, e.lotes_alterados, e.lotes_removidos, e.mensagem,
            (select count(*)::int from execucao_coleta x where x.fonte_id = f.id and x.iniciada_em > now() - interval '7 days') execucoes_7d,
            (select count(*)::int from execucao_coleta x where x.fonte_id = f.id and x.iniciada_em > now() - interval '7 days'
                and x.status in ('erro','parcial')) falhas_7d
     from fonte f
     left join lateral (select * from execucao_coleta x where x.fonte_id = f.id order by x.id desc limit 1) e on true
     order by f.ativa desc, ativos desc, f.id`,
  );
}
