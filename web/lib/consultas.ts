import { consulta } from "./db";

import { montarWhere, ORDEM_PADRAO, ORDENS, type Filtros } from "./busca/filtros";

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
  fonte_nome: string;
  comitente: string | null;
  leiloeiro: string | null;
  titulo: string | null;
  modalidade: string;
  status: string;
  valor_avaliacao: number | null;
  lance_minimo: number | null;
  praca_atual: number | null;
  data_leilao: string | null;
  ocupacao: string;
  debitos_por_conta: string;
  aceita_financiamento: boolean | null;
  aceita_fgts: boolean | null;
  aceita_parcelamento: boolean | null;
  foto: string | null;
  n_fontes: number;
  desconto_avaliacao: number | null;
  preco_m2: number | null;
  preco_caiu: boolean;
};

const COLUNAS_ITEM = `imovel_id, tipo, uf, cidade, bairro, endereco, area::float8 area, quartos, vagas, lat, lon, fonte_nome,
  comitente, leiloeiro, titulo, modalidade, status, valor_avaliacao::float8 valor_avaliacao, lance_minimo::float8 lance_minimo,
  praca_atual, data_leilao, ocupacao, debitos_por_conta, aceita_financiamento, aceita_fgts, aceita_parcelamento, foto,
  n_fontes::int n_fontes, desconto_avaliacao::float8 desconto_avaliacao, preco_m2::float8 preco_m2, preco_caiu`;

export const POR_PAGINA = 24;
export const MAX_PONTOS = 20000;

/** Lista de imóveis (a área visível do mapa, quando há bbox). */
export async function buscar(f: Filtros) {
  const { where, params } = montarWhere(f, true);
  const ordem = ORDENS[f.ordem ?? ORDEM_PADRAO] ?? ORDENS[ORDEM_PADRAO];
  const pagina = f.pagina ?? 1;
  const [itens, total] = await Promise.all([
    consulta<ItemBusca>(
      `select ${COLUNAS_ITEM} from vw_busca ${where} order by ${ordem}, imovel_id
       limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
      params,
    ),
    consulta<{ n: number }>(`select count(*)::int n from vw_busca ${where}`, params),
  ]);
  return { itens, total: total[0]?.n ?? 0, pagina, por_pagina: POR_PAGINA };
}

/** Pontos do mapa: compactos, [id, lat, lon, desconto] (sem recorte de tela). */
export async function pontos(f: Filtros) {
  const { where, params } = montarWhere(f, false);
  const linhas = await consulta<{ p: [number, number, number, number | null] }>(
    `select json_build_array(imovel_id, round(lat::numeric, 5), round(lon::numeric, 5), desconto_avaliacao) p
     from vw_busca ${where} ${where ? "and" : "where"} lat is not null limit ${MAX_PONTOS}`,
    params,
  );
  return linhas.map((l) => l.p.map((v) => (v == null ? null : Number(v))) as [number, number, number, number | null]);
}

/** Resumo de um imóvel para o balão do mapa (livre). */
export async function resumo(id: number) {
  const [r] = await consulta<ItemBusca>(`select ${COLUNAS_ITEM} from vw_busca where imovel_id = $1`, [id]);
  return r ?? null;
}

/** Até 4 imóveis parecidos: mesma cidade e tipo, preço mais próximo (livre). */
export async function parecidos(id: number) {
  return consulta<ItemBusca>(
    `select ${COLUNAS_ITEM} from vw_busca v
     where v.imovel_id <> $1
       and (v.cidade, v.uf, v.tipo) = (select cidade, uf, tipo from vw_busca where imovel_id = $1)
     order by abs(v.lance_minimo - (select lance_minimo from vw_busca where imovel_id = $1)) nulls last
     limit 4`,
    [id],
  );
}

/** Cidade ou bairro → área do mapa (livre: é só para posicionar o mapa). */
export async function lugares(q: string) {
  return consulta<{ rotulo: string; uf: string; n: number; o: number; s: number; l: number; nn: number }>(
    `with alvo as (select unaccent(lower($1)) t)
     select max(rotulo) rotulo, max(uf) uf, count(*)::int n, min(lon) o, min(lat) s, max(lon) l, max(lat) nn from (
       select cidade || '/' || uf rotulo, uf, lat, lon from vw_busca, alvo
        where lat is not null and unaccent(lower(cidade)) like alvo.t || '%'
       union all
       select bairro || ', ' || cidade || '/' || uf, uf, lat, lon from vw_busca, alvo
        where lat is not null and bairro is not null and unaccent(lower(bairro)) like alvo.t || '%'
     ) x group by unaccent(lower(rotulo)) order by n desc limit 8`,
    [q],
  );
}

export async function totais() {
  const [r] = await consulta<{ imoveis: number; fontes: number; atualizado: string | null }>(
    `select (select count(*)::int from vw_busca) imoveis,
            (select count(distinct fonte_id)::int from lote where status in ('ativo','suspenso')) fontes,
            (select max(finalizada_em) from execucao_coleta where status = 'ok') atualizado`,
  );
  return r;
}

export async function opcoesFiltro() {
  const [ufs, comitentes, leiloeiros] = await Promise.all([
    consulta<{ uf: string; n: number }>("select uf, count(*)::int n from vw_busca where uf is not null group by uf order by uf"),
    consulta<{ comitente: string; n: number }>(
      "select comitente, count(*)::int n from vw_busca where comitente is not null group by comitente order by n desc",
    ),
    consulta<{ leiloeiro: string; n: number }>(
      "select leiloeiro, count(*)::int n from vw_busca where leiloeiro is not null group by leiloeiro order by n desc limit 300",
    ),
  ]);
  return { ufs, comitentes, leiloeiros };
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
  aceita_parcelamento: boolean | null;
  debitos_por_conta: string;
  leiloeiro: string | null;
  comitente: string | null;
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
