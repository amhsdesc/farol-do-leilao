-- Alertas: por imóvel (lembrete antes do leilão, mudança de preço/data, suspensão) e por busca salva
-- (avisa quando aparece um imóvel novo que bate com os filtros). Ver docs/produto.md.

create table if not exists alerta (
    id              bigserial primary key,
    usuario_id      integer not null references users(id) on delete cascade,
    tipo            text not null,                 -- imovel | busca
    imovel_id       bigint references imovel(id) on delete cascade,   -- só para tipo = imovel
    filtros         jsonb,                                            -- só para tipo = busca (mesmo formato de web/lib/busca/filtros.ts)
    nome            text,                           -- rótulo da busca salva; nulo = calculado a partir dos filtros
    canal_email     boolean not null default true,
    canal_whatsapp  boolean not null default true,
    canal_telegram  boolean not null default false,
    ativo           boolean not null default true,
    criado_em       timestamptz not null default now(),
    pausado_em      timestamptz,
    check (tipo in ('imovel', 'busca')),
    check ((tipo = 'imovel') = (imovel_id is not null)),
    check ((tipo = 'busca') = (filtros is not null))
);
create index if not exists alerta_usuario_idx on alerta (usuario_id, ativo);
create index if not exists alerta_imovel_idx on alerta (imovel_id) where tipo = 'imovel';
-- um alerta de imóvel por pessoa (reativar o existente em vez de duplicar)
create unique index if not exists alerta_imovel_unico_idx on alerta (usuario_id, imovel_id) where tipo = 'imovel';

-- Fila de mudanças detectadas pelo coletor (preço, data, suspensão, indisponibilidade). Processada pelo
-- envio de notificações e nunca apagada (auditoria de "por que a pessoa recebeu esse alerta").
create table if not exists evento_alerta (
    id              bigserial primary key,
    imovel_id       bigint not null references imovel(id) on delete cascade,
    lote_id         bigint references lote(id),
    tipo            text not null,                 -- preco | data | suspenso | indisponivel
    valor_anterior  text,
    valor_novo      text,
    detectado_em    timestamptz not null default now(),
    processado_em   timestamptz
);
create index if not exists evento_alerta_pendente_idx on evento_alerta (imovel_id) where processado_em is null;

-- Log de envio, append-only. Evita mandar o mesmo aviso duas vezes (por alerta, imóvel, tipo e canal).
create table if not exists notificacao_enviada (
    id           bigserial primary key,
    alerta_id    bigint not null references alerta(id) on delete cascade,
    imovel_id    bigint not null references imovel(id) on delete cascade,
    tipo_evento  text not null,   -- lembrete_7d | lembrete_1d | lembrete_1h | preco | data | suspenso | indisponivel | novo_imovel
    canal        text not null,   -- email | whatsapp | telegram
    enviado_em   timestamptz not null default now(),
    erro         text             -- preenchido quando o envio falhou (fica registrado, mas não é reprocessado sozinho)
);
create unique index if not exists notificacao_unica_idx on notificacao_enviada (alerta_id, imovel_id, tipo_evento, canal);
