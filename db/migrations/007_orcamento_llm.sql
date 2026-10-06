-- Teto global de gasto com IA no coletor.
-- Antes, o único limite era por fonte (LLM_MAX_PAGINAS_POR_EXECUCAO = 200): com mais de 200 fontes, o teto real era
-- de dezenas de milhares de chamadas por coleta. Agora todas as fontes dividem um limite diário, contado no banco
-- (cada fonte roda num processo diferente, então só o banco é compartilhado). Dia no fuso de São Paulo.
create table if not exists llm_uso_coletor (
    dia       date primary key,
    chamadas  integer not null default 0
);

-- O limite fica aqui para poder ser mudado sem mexer em código:  update llm_orcamento set max_chamadas_dia = 600 where nome = 'coletor';
-- Zero (ou negativo) trava toda leitura nova por IA; páginas que não mudaram (cache) continuam sendo lidas de graça.
create table if not exists llm_orcamento (
    nome             text primary key,
    max_chamadas_dia integer not null
);

insert into llm_orcamento (nome, max_chamadas_dia) values ('coletor', 1000) on conflict (nome) do nothing;
