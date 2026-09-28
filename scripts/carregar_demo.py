"""Carrega dados FICTÍCIOS de demonstração para ver o site funcionando antes da primeira coleta real.

    python scripts/carregar_demo.py            # carrega
    python scripts/carregar_demo.py --limpar   # remove tudo que é demo

As fontes de demonstração têm id começando com 'demo-' e não se misturam com as reais.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "coletor"))

from coletor.banco import conectar, migrar  # noqa: E402
from coletor.coleta import executar  # noqa: E402
from coletor.http import Cliente  # noqa: E402

FIX = RAIZ / "coletor" / "tests" / "fixtures"
SITE = "https://www.leiloeiro-teste.com.br"

# coordenadas aproximadas só para a demonstração (geo_fonte = 'demo')
COORDENADAS_DEMO = {
    ("demo-caixa", "1444400000001"): (-15.7625, -47.8820),
    ("demo-caixa", "1444400000002"): (-15.8390, -48.0220),
    ("demo-caixa", "1444400000003"): (-15.6520, -47.7890),
    ("demo-caixa", "1555500000009"): (-16.7050, -49.2700),
    ("demo-leiloeiro", "101"): (-15.8420, -48.0290),
    ("demo-api", "9002"): (-16.2530, -47.9500),
}


def transporte() -> httpx.MockTransport:
    arquivos = {
        SITE + "/imoveis": {"1": "leiloeiro_lista_1.html", "2": "leiloeiro_lista_2.html"},
        SITE + "/lote/101": "leiloeiro_lote_101.html",
        SITE + "/lote/102": "leiloeiro_lote_102.html",
    }
    api = {1: json.loads((FIX / "api_pagina_1.json").read_text()), 2: json.loads((FIX / "api_pagina_2.json").read_text())}

    def handler(req: httpx.Request) -> httpx.Response:
        u = str(req.url).split("?")[0]
        if u.endswith("robots.txt"):
            return httpx.Response(404)
        if "api." in u:
            return httpx.Response(200, json=api.get(int(req.url.params.get("pagina", 1)), {"dados": {"itens": []}}))
        alvo = arquivos.get(u)
        if isinstance(alvo, dict):
            alvo = alvo.get(req.url.params.get("pagina", "1"))
        if not alvo:
            return httpx.Response(404)
        return httpx.Response(200, content=(FIX / alvo).read_bytes(), headers={"content-type": "text/html"})
    return httpx.MockTransport(handler)


def main() -> None:
    sys.path.insert(0, str(RAIZ / "coletor"))
    from tests.test_adaptadores import FONTE_SELETORES  # reaproveita a configuração de teste

    with conectar() as conn:
        migrar(conn)
        if "--limpar" in sys.argv:
            with conn.cursor() as cur:
                cur.execute("delete from leitura where lote_id in (select id from lote where fonte_id like 'demo-%')")
                cur.execute("delete from pagina_cache where url like %s", (SITE + "%",))
                cur.execute("create temp table _im as select distinct imovel_id from lote where fonte_id like 'demo-%'")
                cur.execute("delete from lote where fonte_id like 'demo-%'")
                cur.execute("delete from execucao_coleta where fonte_id like 'demo-%'")
                cur.execute("delete from fonte where id like 'demo-%'")
                cur.execute("delete from imovel where id in (select imovel_id from _im) and not exists (select 1 from lote l where l.imovel_id = imovel.id)")
            conn.commit()
            print("Dados de demonstração removidos.")
            return

        cli = Cliente(intervalo=0, transport=transporte())
        fontes = [
            {"id": "demo-caixa", "nome": "Caixa (demonstração)", "tipo": "csv_caixa", "uf": ["DF", "GO"],
             "arquivo_local": str(FIX / "Lista_imoveis_{uf}.csv")},
            {**FONTE_SELETORES, "id": "demo-leiloeiro", "nome": "Leiloeiro Teste (demonstração)", "site": SITE},
            {"id": "demo-api", "nome": "Leiloeiro API (demonstração)", "tipo": "json_api", "uf": ["DF", "GO"],
             "requisicao": {"url": "https://api.leiloeiro-teste.com.br/v1/lotes", "params": {"pagina": "{pagina}"}},
             "itens": "dados.itens", "total_paginas": "dados.totalPaginas",
             "campos": {"id_externo": {"json": "id"}, "titulo": {"json": "titulo"}, "tipo": {"json": "categoria.nome"},
                        "descricao": {"json": "descricao"}, "uf": {"json": "endereco.uf"}, "cidade": {"json": "endereco.cidade"},
                        "bairro": {"json": "endereco.bairro"}, "endereco": {"json": "endereco.logradouro"},
                        "lat": {"json": "endereco.latitude"}, "lon": {"json": "endereco.longitude"},
                        "valor_avaliacao": {"json": "valorAvaliacao"}, "data_praca1": {"json": "pracas[0].data"},
                        "valor_praca1": {"json": "pracas[0].lanceInicial"}, "data_praca2": {"json": "pracas[1].data"},
                        "valor_praca2": {"json": "pracas[1].lanceInicial"}, "fotos": {"json": "fotos"}},
             "url_lote": "https://www.leiloeiro-teste.com.br/lote/{id}"},
        ]
        # o seletor de demonstração lê a listagem sem paginação no caminho
        fontes[1]["listagem"] = {**fontes[1]["listagem"], "url": SITE + "/imoveis?pagina={pagina}"}
        for f in fontes:
            r = executar(f, conn, cli)
            print(f"{f['id']}: {r.status}, {r.contadores.novos} novos, {r.contadores.alterados} alterados")
        with conn.cursor() as cur:
            for (fonte, idx), (lat, lon) in COORDENADAS_DEMO.items():
                cur.execute(
                    """update imovel set geom = st_setsrid(st_makepoint(%s, %s), 4326)::geography,
                              geo_precisao = 'endereco', geo_fonte = 'demo'
                       where id = (select imovel_id from lote where fonte_id = %s and id_externo = %s) and geom is null""",
                    (lon, lat, fonte, idx),
                )
        conn.commit()
    print("Demonstração carregada. Abra o site em http://localhost:3000")


if __name__ == "__main__":
    main()
