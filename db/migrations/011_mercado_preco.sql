-- Preço de mercado por m² por região (calculadora e ficha do imóvel).
-- É o cache compartilhado do mecanismo "valor de mercado": quem pesquisa primeiro paga a consulta externa; todos os
-- outros (e a ficha) leem daqui, de graça. Só preços de ANÚNCIOS de venda parecidos (nunca o valor do edital).
--
-- Só se acrescenta linha, nunca se altera nem se apaga (regra 1 do projeto): o histórico de preço por região vira
-- série temporal. A leitura pega a linha mais recente de cada chave (vw_mercado_atual).
--
-- Linha com preco_m2 nulo = "tentei e não havia anúncios suficientes". Guarda a tentativa para não repetir a mesma
-- consulta externa a cada clique (a validade dessas tentativas é curta; ver web/lib/calculadora/mercadoCore.ts).
create table if not exists mercado_preco (
    id            bigserial primary key,
    uf            text    not null,
    cidade_chave  text    not null,              -- cidade sem acento, minúscula, com hífens
    bairro_chave  text    not null default '',   -- '' = a cidade inteira
    tipo          text    not null,
    faixa_min     integer not null,              -- faixa de área (m²) agrupada: imóveis de tamanho próximo compartilham a linha
    faixa_max     integer not null,
    escopo        text    not null,              -- bairro | cidade
    fonte         text    not null,              -- chaves-na-mao | ia
    preco_m2      numeric(12,2),                 -- mediana de R$/m² (nulo = tentativa sem resultado)
    p25           numeric(12,2),
    p75           numeric(12,2),
    n             integer not null default 0,    -- anúncios usados na mediana
    motivo        text,                          -- por que não houve resultado (só quando preco_m2 é nulo)
    amostras      jsonb   not null default '[]', -- até 6 anúncios mais parecidos: título, preço, área, R$/m², link
    coletado_em   timestamptz not null default now(),
    check (escopo in ('bairro', 'cidade')),
    check (fonte in ('chaves-na-mao', 'ia'))
);

create index if not exists mercado_preco_chave_idx
    on mercado_preco (uf, cidade_chave, tipo, faixa_min, faixa_max, bairro_chave, coletado_em desc);

create or replace view vw_mercado_atual as
select distinct on (uf, cidade_chave, bairro_chave, tipo, faixa_min, faixa_max) *
from mercado_preco
order by uf, cidade_chave, bairro_chave, tipo, faixa_min, faixa_max, coletado_em desc, id desc;

-- Teto diário de chamadas de IA na pesquisa de mercado (a reserva paga). Contador próprio, separado do enriquecimento
-- da ficha (llm_uso_dia), para uma coisa não consumir o limite da outra. Dia no fuso de São Paulo.
create table if not exists mercado_ia_uso_dia (
    dia       date primary key,
    chamadas  integer not null default 0
);
