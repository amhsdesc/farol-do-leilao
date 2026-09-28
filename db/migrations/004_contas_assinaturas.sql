-- Contas de usuário (login com Google via Auth.js), celular validado por WhatsApp e assinaturas (Asaas).
-- As quatro primeiras tabelas seguem o formato exigido pelo @auth/pg-adapter (nomes em inglês por isso).

create table if not exists users (
    id              serial primary key,
    name            varchar(255),
    email           varchar(255),
    "emailVerified" timestamptz,
    image           text,
    -- campos do Farol
    telefone               text,          -- E.164, ex.: +5561999998888; só preenchido depois de validado
    telefone_validado_em   timestamptz,
    criado_em              timestamptz not null default now()
);
create unique index if not exists users_email_idx on users (lower(email));
-- um celular validado pertence a uma conta só (impede repetir o teste grátis com outro e-mail)
create unique index if not exists users_telefone_idx on users (telefone) where telefone is not null;

create table if not exists accounts (
    id                  serial primary key,
    "userId"            integer not null references users(id) on delete cascade,
    type                varchar(255) not null,
    provider            varchar(255) not null,
    "providerAccountId" varchar(255) not null,
    refresh_token       text,
    access_token        text,
    expires_at          bigint,
    id_token            text,
    scope               text,
    session_state       text,
    token_type          text,
    unique (provider, "providerAccountId")
);

create table if not exists sessions (
    id             serial primary key,
    "userId"       integer not null references users(id) on delete cascade,
    expires        timestamptz not null,
    "sessionToken" varchar(255) not null unique
);

create table if not exists verification_token (
    identifier text not null,
    expires    timestamptz not null,
    token      text not null,
    primary key (identifier, token)
);

-- Códigos enviados por WhatsApp. Guardamos só o hash do código.
create table if not exists codigo_celular (
    id            bigserial primary key,
    usuario_id    integer not null references users(id) on delete cascade,
    telefone      text not null,
    codigo_hash   text not null,
    criado_em     timestamptz not null default now(),
    expira_em     timestamptz not null,
    tentativas    smallint not null default 0,
    usado_em      timestamptz
);
create index if not exists codigo_celular_usuario_idx on codigo_celular (usuario_id, criado_em desc);

-- Assinatura: uma por usuário. O teste grátis de 7 dias vale uma vez por usuário e por celular.
create table if not exists assinatura (
    usuario_id             integer primary key references users(id) on delete cascade,
    plano                  text,                  -- mensal | trimestral | anual (null durante o teste)
    status                 text not null,         -- teste | aguardando_pagamento | ativa | atrasada | cancelada
    teste_inicio           timestamptz,
    teste_ate              timestamptz,
    teste_telefone         text,                  -- celular usado no teste grátis
    pago_ate               timestamptz,           -- acesso pago garantido até esta data
    asaas_cliente_id       text,
    asaas_assinatura_id    text unique,
    cancelada_em           timestamptz,
    criada_em              timestamptz not null default now(),
    atualizada_em          timestamptz not null default now()
);
create unique index if not exists assinatura_teste_telefone_idx on assinatura (teste_telefone) where teste_telefone is not null;

-- Tudo que o Asaas avisa pelo webhook, do jeito que chegou. Nunca apagar (auditoria de cobrança).
create table if not exists evento_pagamento (
    id              bigserial primary key,
    evento_id       text unique,          -- id do evento no Asaas (evita processar duas vezes)
    tipo            text not null,
    asaas_assinatura_id text,
    asaas_pagamento_id  text,
    recebido_em     timestamptz not null default now(),
    corpo           jsonb not null
);
create index if not exists evento_pagamento_assinatura_idx on evento_pagamento (asaas_assinatura_id);
