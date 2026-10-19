"""padronizar_comitentes contra um Postgres de verdade. Só roda com FAROL_TEST_DATABASE_URL apontando para um banco
descartável (cria e apaga tabelas fonte/lote de teste num schema próprio). Sem a variável, é ignorado."""
import os

import pytest

URL = os.environ.get("FAROL_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="defina FAROL_TEST_DATABASE_URL para testar com banco")


@pytest.fixture()
def conn():
    import psycopg
    from psycopg.rows import dict_row

    c = psycopg.connect(URL, row_factory=dict_row)
    with c.cursor() as cur:
        cur.execute("drop schema if exists teste_comitente cascade; create schema teste_comitente; set search_path = teste_comitente")
        cur.execute("create table fonte (id text primary key, nome text not null)")
        cur.execute("""create table lote (id serial primary key, fonte_id text references fonte(id), titulo text, descricao text,
                       comitente text)""")
    c.commit()
    yield c
    with c.cursor() as cur:
        cur.execute("drop schema teste_comitente cascade")
    c.commit()
    c.close()


def test_individuais_viram_independente_mesmo_com_preposicao_em_outra_caixa(conn, monkeypatch):
    from coletor import registro
    from coletor.cli import padronizar_comitentes
    from coletor.normalizar import LEILOEIRO_INDEPENDENTE

    monkeypatch.setattr(registro, "carregar", lambda *a, **k: {
        "gabriel-silva-da-rosa": {"leiloeiro_individual": True},
        "caroline-de-sousa-ribas": {"leiloeiro_individual": True},
        "frazao": {},
    })
    with conn.cursor() as cur:
        cur.execute("insert into fonte values ('gabriel-silva-da-rosa','Gabriel Silva Da Rosa'),('caroline-de-sousa-ribas','Caroline De Sousa Ribas'),('frazao','Frazão Leilões')")
        # como ficaram no banco: o passo 1 reescreve "Da/De" para "da/de"
        cur.execute("""insert into lote (fonte_id, comitente) values
            ('gabriel-silva-da-rosa','Gabriel Silva Da Rosa'),
            ('gabriel-silva-da-rosa','Gabriel Silva da Rosa'),
            ('caroline-de-sousa-ribas','Caroline de Sousa Ribas'),
            ('caroline-de-sousa-ribas','Banco Pan'),
            ('frazao','Frazão Leilões')""")
    conn.commit()
    padronizar_comitentes(conn)
    with conn.cursor() as cur:
        cur.execute("select fonte_id, comitente from lote order by id")
        rows = [(r["fonte_id"], r["comitente"]) for r in cur.fetchall()]
    assert rows == [
        ("gabriel-silva-da-rosa", LEILOEIRO_INDEPENDENTE),
        ("gabriel-silva-da-rosa", LEILOEIRO_INDEPENDENTE),
        ("caroline-de-sousa-ribas", LEILOEIRO_INDEPENDENTE),
        ("caroline-de-sousa-ribas", "Banco Pan"),  # vendedor de verdade continua
        ("frazao", "Frazão Leilões"),  # não é individual: continua como estava
    ]
    # rodar de novo não muda nada (idempotente)
    assert padronizar_comitentes(conn) == 0
