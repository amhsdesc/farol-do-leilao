-- Quantas leituras de IA cada fonte fez por dia. Serve para descobrir de onde vem o gasto:
--   select fonte_id, chamadas from llm_uso_fonte where dia = current_date order by chamadas desc;
create table if not exists llm_uso_fonte (
    dia       date not null,
    fonte_id  text not null,
    chamadas  integer not null default 0,
    primary key (dia, fonte_id)
);
