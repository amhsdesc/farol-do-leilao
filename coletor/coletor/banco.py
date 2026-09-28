"""Conexão com o PostgreSQL e aplicação das migrações."""
from __future__ import annotations

from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .config import RAIZ, config

PASTA_MIGRACOES = RAIZ / "db" / "migrations"


def conectar(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or config.database_url, row_factory=dict_row, autocommit=False)


def migrar(conn: psycopg.Connection, pasta: Path = PASTA_MIGRACOES) -> list[str]:
    """Aplica, em ordem, os .sql ainda não aplicados. Devolve os nomes aplicados agora."""
    with conn.cursor() as cur:
        cur.execute("create table if not exists migracao (nome text primary key, aplicada_em timestamptz not null default now())")
        cur.execute("select nome from migracao")
        feitas = {r["nome"] for r in cur.fetchall()}
    aplicadas = []
    for arquivo in sorted(pasta.glob("*.sql")):
        if arquivo.name in feitas:
            continue
        with conn.cursor() as cur:
            cur.execute(arquivo.read_text(encoding="utf-8"))
            cur.execute("insert into migracao (nome) values (%s)", (arquivo.name,))
        aplicadas.append(arquivo.name)
    conn.commit()
    return aplicadas
