-- Hasta · schema inicial
-- PostgreSQL 16 + PostGIS 3

create extension if not exists postgis;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Fontes (sites). Espelha os YAML de coletor/fontes.
create table if not exists fonte (
    id              text primary key,              -- slug: 'caixa-df', 'leiloeiro-x'
    nome            text not null,
    site            text,
    tipo_adaptador  text not null,                 -- csv_caixa | json_api | seletores | automatico
    plataforma      text,                          -- software do site, quando conhecido
    uf              text[] not null default '{}',
    ativa           boolean not null default true,
    config          jsonb not null default '{}',
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now()
);

-- Log de cada rodada de coleta
create table if not exists execucao_coleta (
    id               bigserial primary key,
    fonte_id         text not null references fonte(id),
    iniciada_em      timestamptz not null default now(),
    finalizada_em    timestamptz,
    status           text not null default 'rodando',  -- rodando | ok | parcial | erro
    lotes_lidos      int not null default 0,
    lotes_novos      int not null default 0,
    lotes_alterados  int not null default 0,
    lotes_removidos  int not null default 0,
    erros            int not null default 0,
    mensagem         text
);
create index if not exists execucao_fonte_idx on execucao_coleta (fonte_id, iniciada_em desc);

-- Ficha única do imóvel (deduplicada entre fontes)
create table if not exists imovel (
    id                    bigserial primary key,
    tipo                  text,        -- apartamento | casa | terreno | rural | comercial | galpao | outros
    uf                    char(2),
    cidade                text,
    bairro                text,
    endereco              text,
    endereco_normalizado  text,
    area_privativa        numeric(12,2),
    area_total            numeric(12,2),
    area_terreno          numeric(14,2),
    quartos               smallint,
    vagas                 smallint,
    matricula             text,
    cartorio              text,
    geom                  geography(Point, 4326),
    geo_precisao          text,        -- endereco | rua | bairro | cidade | manual
    geo_fonte             text,
    criado_em             timestamptz not null default now(),
    atualizado_em         timestamptz not null default now()
);
create index if not exists imovel_geom_idx on imovel using gist (geom);
create index if not exists imovel_local_idx on imovel (uf, cidade);
create index if not exists imovel_end_trgm_idx on imovel using gin (endereco_normalizado gin_trgm_ops);

-- Chaves de deduplicação: várias chaves podem apontar para o mesmo imóvel
create table if not exists imovel_chave (
    chave      text primary key,          -- 'mat:<cartorio>:<matricula>' | 'end:<uf>:<cidade>:<endereco>:<area>' | 'caixa:<n>'
    imovel_id  bigint not null references imovel(id) on delete cascade,
    criado_em  timestamptz not null default now()
);
create index if not exists imovel_chave_imovel_idx on imovel_chave (imovel_id);

-- Cada anúncio de cada fonte (estado atual)
create table if not exists lote (
    id                    bigserial primary key,
    fonte_id              text not null references fonte(id),
    id_externo            text not null,
    imovel_id             bigint references imovel(id),
    url                   text,
    titulo                text,
    descricao             text,
    modalidade            text,     -- judicial | extrajudicial | venda_direta | licitacao | outros
    status                text not null default 'ativo',  -- ativo | suspenso | encerrado | arrematado | deserto | removido
    valor_avaliacao       numeric(14,2),
    lance_minimo          numeric(14,2),   -- valor vigente agora
    praca_atual           smallint,
    data_praca1           timestamptz,
    valor_praca1          numeric(14,2),
    data_praca2           timestamptz,
    valor_praca2          numeric(14,2),
    ocupacao              text not null default 'nao_informado',  -- ocupado | desocupado | nao_informado
    aceita_financiamento  boolean,
    aceita_fgts           boolean,
    leiloeiro             text,
    processo              text,
    edital_url            text,
    fotos                 text[] not null default '{}',
    dados                 jsonb not null default '{}',   -- campos extras da fonte
    hash_conteudo         text not null,
    primeiro_visto_em     timestamptz not null default now(),
    ultimo_visto_em       timestamptz not null default now(),
    unique (fonte_id, id_externo)
);
create index if not exists lote_imovel_idx on lote (imovel_id);
create index if not exists lote_status_idx on lote (fonte_id, status);

-- Histórico: um snapshot por mudança. NUNCA apagar.
create table if not exists leitura (
    id              bigserial primary key,
    lote_id         bigint not null references lote(id),
    execucao_id     bigint references execucao_coleta(id),
    lida_em         timestamptz not null default now(),
    evento          text not null,   -- novo | alterado | removido | reaparecido
    hash_conteudo   text not null,
    status          text,
    lance_minimo    numeric(14,2),
    praca_atual     smallint,
    snapshot        jsonb not null
);
create index if not exists leitura_lote_idx on leitura (lote_id, lida_em desc);

-- Cache de geocodificação
create table if not exists geocache (
    consulta       text primary key,
    lat            double precision,
    lon            double precision,
    precisao       text,
    fonte          text,
    resposta       jsonb,
    consultado_em  timestamptz not null default now()
);

-- Cache de páginas processadas por LLM (evita pagar duas vezes pela mesma página)
create table if not exists pagina_cache (
    url            text primary key,
    hash_texto     text not null,
    extraido       jsonb,
    atualizado_em  timestamptz not null default now()
);

-- Controle de migrações
create table if not exists migracao (
    nome        text primary key,
    aplicada_em timestamptz not null default now()
);

-- View usada pelo site: um registro por imóvel, com o melhor lote ativo
create or replace view vw_busca as
with ativos as (
    select l.*,
           row_number() over (partition by l.imovel_id
                              order by l.lance_minimo nulls last, l.ultimo_visto_em desc) as ordem,
           count(*) over (partition by l.imovel_id) as n_fontes,
           -- ocupação consolidada entre fontes: 'ocupado' prevalece (conservador), depois 'desocupado'
           case when bool_or(l.ocupacao = 'ocupado') over (partition by l.imovel_id) then 'ocupado'
                when bool_or(l.ocupacao = 'desocupado') over (partition by l.imovel_id) then 'desocupado'
                else 'nao_informado' end as ocupacao_consolidada
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
       a.url, a.titulo, a.modalidade, a.status,
       a.valor_avaliacao, a.lance_minimo, a.praca_atual,
       a.data_praca1, a.data_praca2,
       a.ocupacao_consolidada as ocupacao, a.aceita_financiamento, a.aceita_fgts,
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
