-- Comitente = quem vende o imóvel (Caixa, Santander, BB, Emgea, União...). Um banco vende por vários leiloeiros,
-- então comitente e fonte são coisas diferentes.
alter table lote add column if not exists comitente text;
alter table fonte add column if not exists comitente text;
create index if not exists lote_comitente_idx on lote (comitente);

drop view if exists vw_busca;
create view vw_busca as
with ativos as (
    select l.*,
           row_number() over (partition by l.imovel_id
                              order by l.lance_minimo nulls last, l.ultimo_visto_em desc) as ordem,
           count(*) over (partition by l.imovel_id) as n_fontes,
           case when bool_or(l.ocupacao = 'ocupado') over (partition by l.imovel_id) then 'ocupado'
                when bool_or(l.ocupacao = 'desocupado') over (partition by l.imovel_id) then 'desocupado'
                else 'nao_informado' end as ocupacao_consolidada,
           max(l.comitente) over (partition by l.imovel_id) as comitente_consolidado
    from lote l
    where l.status in ('ativo', 'suspenso') and l.imovel_id is not null
)
select i.id                          as imovel_id,
       i.tipo, i.uf, i.cidade, i.bairro, i.endereco,
       coalesce(i.area_privativa, i.area_total, i.area_terreno) as area,
       i.quartos, i.vagas,
       st_y(i.geom::geometry)        as lat,
       st_x(i.geom::geometry)        as lon,
       i.geo_precisao,
       a.id                          as lote_id,
       a.fonte_id,
       f.nome                        as fonte_nome,
       a.comitente_consolidado       as comitente,
       a.url, a.titulo, a.modalidade, a.status,
       a.valor_avaliacao, a.lance_minimo, a.praca_atual,
       a.data_praca1, a.data_praca2,
       a.ocupacao_consolidada        as ocupacao,
       a.aceita_financiamento, a.aceita_fgts,
       a.fotos[1]                    as foto,
       a.n_fontes,
       case when a.valor_avaliacao > 0 and a.lance_minimo > 0
            then round(1 - a.lance_minimo / a.valor_avaliacao, 4) end as desconto_avaliacao,
       a.primeiro_visto_em,
       a.ultimo_visto_em
from ativos a
join imovel i on i.id = a.imovel_id
join fonte  f on f.id = a.fonte_id
where a.ordem = 1;
