-- Enriquecimento sob demanda: quando um ASSINANTE abre a ficha de um imóvel que veio com poucos dados
-- (ex.: a lista da Caixa), o site lê a página de detalhe (e, se houver, a do leiloeiro) e extrai o que
-- falta com IA. Fica numa tabela própria, e não em `lote`, porque o coletor reescreve `lote` a cada
-- rodada: o que foi descoberto aqui não pode ser apagado por uma coleta que não traz esses campos.
-- A leitura do texto da página usa `pagina_cache` (mesmo hash do coletor): página igual não é paga duas vezes.

create table if not exists lote_enriquecimento (
    lote_id        bigint primary key references lote(id) on delete cascade,
    estado         text not null default 'em_andamento',   -- em_andamento | ok | falhou
    dados          jsonb not null default '{}',            -- campos extraídos (ver web/lib/enriquecimento/regras.ts)
    paginas        text[] not null default '{}',           -- páginas lidas. Uso interno: nunca vai para o HTML nem para a API
    tentado_em     timestamptz not null default now(),     -- última tentativa (trava duas visitas simultâneas e espaça as repetições)
    atualizado_em  timestamptz,                            -- última vez que terminou bem
    erro           text,
    check (estado in ('em_andamento', 'ok', 'falhou'))
);

-- Teto de gasto com IA no site: quantas chamadas já foram feitas hoje (fuso de São Paulo).
create table if not exists llm_uso_dia (
    dia       date primary key,
    chamadas  integer not null default 0
);
