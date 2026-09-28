-- Campos para os filtros da busca (página inicial).
-- aceita_parcelamento: a fonte diz que aceita pagar parcelado (null = não disse).
-- debitos_por_conta: quem paga IPTU/condomínio atrasados. 'vendedor' | 'arrematante' | 'nao_informado'.
--   Mesma regra da ocupação: só afirmamos o que a fonte afirma.
alter table lote add column if not exists aceita_parcelamento boolean;
alter table lote add column if not exists debitos_por_conta text not null default 'nao_informado';

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
           -- dívidas: se alguma fonte diz que ficam com o arrematante, vale essa (a mais cautelosa)
           case when bool_or(l.debitos_por_conta = 'arrematante') over (partition by l.imovel_id) then 'arrematante'
                when bool_or(l.debitos_por_conta = 'vendedor') over (partition by l.imovel_id) then 'vendedor'
                else 'nao_informado' end as debitos_consolidado,
           max(l.comitente) over (partition by l.imovel_id) as comitente_consolidado,
           min(l.primeiro_visto_em) over (partition by l.imovel_id) as primeiro_visto_imovel
    from lote l
    where l.status in ('ativo', 'suspenso') and l.imovel_id is not null
)
select i.id                          as imovel_id,
       i.tipo, i.uf, i.cidade, i.bairro, i.endereco,
       coalesce(i.area_privativa, i.area_total, i.area_terreno) as area,
       i.quartos, i.vagas,
       i.geom,
       st_y(i.geom::geometry)        as lat,
       st_x(i.geom::geometry)        as lon,
       i.geo_precisao,
       a.id                          as lote_id,
       a.fonte_id,
       f.nome                        as fonte_nome,
       a.comitente_consolidado       as comitente,
       a.leiloeiro,
       a.url, a.titulo, a.modalidade, a.status,
       a.valor_avaliacao, a.lance_minimo, a.praca_atual,
       a.data_praca1, a.data_praca2,
       -- a próxima data de lance que ainda vai acontecer (venda direta não tem)
       case when a.praca_atual = 2 then a.data_praca2
            else coalesce(a.data_praca1, a.data_praca2) end as data_leilao,
       a.ocupacao_consolidada        as ocupacao,
       a.debitos_consolidado         as debitos_por_conta,
       a.aceita_financiamento, a.aceita_fgts, a.aceita_parcelamento,
       a.fotos[1]                    as foto,
       cardinality(a.fotos)          as n_fotos,
       a.n_fontes,
       case when a.valor_avaliacao > 0 and a.lance_minimo > 0
            then round(1 - a.lance_minimo / a.valor_avaliacao, 4) end as desconto_avaliacao,
       case when a.lance_minimo > 0 and coalesce(i.area_privativa, i.area_total, i.area_terreno) > 0
            then round(a.lance_minimo / coalesce(i.area_privativa, i.area_total, i.area_terreno), 2) end as preco_m2,
       -- lance caiu nos últimos 30 dias (2ª praça, nova rodada da Caixa, desconto novo...)
       coalesce((select max(le.lance_minimo) from leitura le
                 where le.lote_id = a.id and le.lida_em > now() - interval '30 days'), 0) > a.lance_minimo
                                     as preco_caiu,
       a.primeiro_visto_imovel       as primeiro_visto_em,
       a.ultimo_visto_em
from ativos a
join imovel i on i.id = a.imovel_id
join fonte  f on f.id = a.fonte_id
where a.ordem = 1;
