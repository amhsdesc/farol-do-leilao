import os
from pathlib import Path

import httpx
import pytest

from coletor.http import Cliente

FIX = Path(__file__).parent / "fixtures"


def transporte(mapa: dict[str, str | bytes | dict]) -> httpx.MockTransport:
    """URL → arquivo de fixture (str terminando em extensão) ou conteúdo. robots.txt ausente = 404."""
    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if url.endswith("/robots.txt"):
            return httpx.Response(404)
        chave = url if url in mapa else url.split("?")[0] if url.split("?")[0] in mapa else None
        if chave is None:
            return httpx.Response(404, text="não mapeado: " + url)
        v = mapa[chave]
        if isinstance(v, dict):
            return httpx.Response(200, json=v)
        if isinstance(v, str) and (FIX / v).exists():
            conteudo = (FIX / v).read_bytes()
            tipo = "application/json" if v.endswith(".json") else "text/csv" if v.endswith(".csv") else "text/html; charset=utf-8"
            return httpx.Response(200, content=conteudo, headers={"content-type": tipo})
        return httpx.Response(200, content=v if isinstance(v, bytes) else v.encode())
    return httpx.MockTransport(handler)


@pytest.fixture
def cliente_para():
    def criar(mapa):
        return Cliente(intervalo=0, transport=transporte(mapa))
    return criar


@pytest.fixture
def conn():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("defina TEST_DATABASE_URL para rodar testes de banco")
    from coletor.banco import conectar, migrar
    c = conectar(url)
    with c.cursor() as cur:
        cur.execute("drop schema if exists public cascade; create schema public;")
    c.commit()
    migrar(c)
    yield c
    c.close()
