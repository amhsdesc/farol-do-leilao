import json
from decimal import Decimal
from pathlib import Path

import httpx

from coletor.adaptadores import Automatico, CaixaCSV, JsonApi, Seletores
from coletor.normalizar import normalizar

FIX = Path(__file__).parent / "fixtures"
CAIXA = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{}.csv"
SITE = "https://www.leiloeiro-teste.com.br"


def test_caixa_csv(cliente_para):
    cli = cliente_para({CAIXA.format("DF"): "Lista_imoveis_DF.csv", CAIXA.format("GO"): "Lista_imoveis_GO.csv"})
    lotes = list(CaixaCSV({"id": "caixa", "tipo": "csv_caixa", "uf": ["DF", "GO"]}, cli).coletar())
    assert len(lotes) == 4
    l = normalizar(lotes[0])
    assert l.id_externo == "1444400000001"
    assert l.uf == "DF" and l.cidade == "Brasilia" and l.bairro == "Asa Norte"
    assert l.tipo == "apartamento" and l.modalidade == "extrajudicial" and l.praca_atual == 2
    assert l.lance_minimo == Decimal("689000.00") and l.valor_avaliacao == Decimal("1150000.00")
    assert l.area_privativa == Decimal("98.00") and l.quartos == 3
    assert normalizar(lotes[1]).modalidade == "venda_direta"
    assert normalizar(lotes[2]).tipo == "casa"


def test_caixa_arquivo_local():
    fonte = {"id": "caixa", "tipo": "csv_caixa", "uf": ["DF"], "arquivo_local": str(FIX / "Lista_imoveis_{uf}.csv")}
    assert len(list(CaixaCSV(fonte, None).coletar())) == 3


FONTE_SELETORES = {
    "id": "leiloeiro-teste", "tipo": "seletores", "uf": ["DF"],
    "listagem": {"url": SITE + "/imoveis?pagina={pagina}", "paginas_max": 5, "item": "div.card-lote",
                 "link": "a.ver-lote@href", "campos": {"titulo": "h3.titulo"}},
    "detalhe": {"campos": {
        "id_externo": {"url_regex": r"/lote/(\d+)"},
        "titulo": "h1",
        "descricao": "div.descricao",
        "endereco": {"rotulo": "Endereço"},
        "cidade": {"rotulo": "Cidade", "regex": r"^([^/]+?)\s*/"},
        "valor_avaliacao": {"rotulo": "Valor de avaliação"},
        "data_praca1": {"texto_regex": r"1º Leilão:\s*([\d/]+ às [\dh]+)"},
        "valor_praca1": {"texto_regex": r"1º Leilão:.{0,40}?R\$\s*([\d.,]+)"},
        "data_praca2": {"texto_regex": r"2º Leilão:\s*([\d/]+ às [\dh]+)"},
        "valor_praca2": {"texto_regex": r"2º Leilão:.{0,40}?R\$\s*([\d.,]+)"},
        "processo": {"texto_regex": r"(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})"},
        "matricula": {"texto_regex": r"Matrícula nº ([\d.]+)"},
        "cartorio": {"texto_regex": r"do (\d+º Ofício de Registro de Imóveis[^.]*)"},
        "edital_url": "a[href*=edital]@href",
        "fotos": {"css": ".galeria img", "attr": "src", "todos": True},
    }},
}


def mapa_leiloeiro():
    return {
        SITE + "/imoveis?pagina=1": "leiloeiro_lista_1.html",
        SITE + "/imoveis?pagina=2": "leiloeiro_lista_2.html",
        SITE + "/lote/101": "leiloeiro_lote_101.html",
        SITE + "/lote/102": "leiloeiro_lote_102.html",
    }


def test_seletores(cliente_para):
    lotes = list(Seletores(FONTE_SELETORES, cliente_para(mapa_leiloeiro())).coletar())
    assert [l.id_externo for l in lotes] == ["102", "101"]
    l = normalizar(lotes[1], {"uf": "DF"})
    assert l.cidade == "Águas Claras" and l.uf == "DF"
    assert l.endereco.startswith("Avenida das Araucárias")
    assert l.modalidade == "judicial" and l.ocupacao == "ocupado"
    assert l.valor_avaliacao == Decimal("480000.00")
    assert l.data_praca2.day == 24 and l.valor_praca2 == Decimal("240000.00")
    assert l.processo == "0701234-56.2024.8.07.0001"
    assert l.matricula == "98.765" and l.cartorio.startswith("3º Ofício")
    assert l.edital_url == SITE + "/arquivos/edital-101.pdf"
    assert l.fotos == [SITE + "/fotos/101-1.jpg", SITE + "/fotos/101-2.jpg"]


def test_json_api(cliente_para):
    api = "https://api.leiloeiro-teste.com.br/v1/lotes"
    paginas = {1: json.loads((FIX / "api_pagina_1.json").read_text()), 2: json.loads((FIX / "api_pagina_2.json").read_text())}

    def handler(req: httpx.Request):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, json=paginas.get(int(req.url.params["pagina"]), {"dados": {"itens": []}}))

    from coletor.http import Cliente
    cli = Cliente(intervalo=0, transport=httpx.MockTransport(handler))
    fonte = {
        "id": "api-teste", "tipo": "json_api",
        "requisicao": {"url": api, "params": {"pagina": "{pagina}", "tamanho": 2}, "paginas_max": 10},
        "itens": "dados.itens", "total_paginas": "dados.totalPaginas",
        "campos": {
            "id_externo": {"json": "id"}, "titulo": {"json": "titulo"}, "tipo": {"json": "categoria.nome"},
            "descricao": {"json": "descricao"}, "uf": {"json": "endereco.uf"}, "cidade": {"json": "endereco.cidade"},
            "bairro": {"json": "endereco.bairro"}, "endereco": {"json": "endereco.logradouro"},
            "lat": {"json": "endereco.latitude"}, "lon": {"json": "endereco.longitude"},
            "valor_avaliacao": {"json": "valorAvaliacao"},
            "data_praca1": {"json": "pracas[0].data"}, "valor_praca1": {"json": "pracas[0].lanceInicial"},
            "data_praca2": {"json": "pracas[1].data"}, "valor_praca2": {"json": "pracas[1].lanceInicial"},
            "fotos": {"json": "fotos"}, "visualizacoes": {"json": "visualizacoes"},
        },
        "url_lote": "https://www.leiloeiro-teste.com.br/lote/{id}",
    }
    lotes = list(JsonApi(fonte, cli).coletar())
    assert [l.id_externo for l in lotes] == ["9001", "9002", "9003"]
    l = normalizar(lotes[0])
    assert l.lat == -15.803 and l.tipo == "casa" and l.ocupacao == "desocupado"
    assert l.url == "https://www.leiloeiro-teste.com.br/lote/9001"
    assert l.dados["visualizacoes"] == 88
    assert normalizar(lotes[2]).tipo == "comercial"


def test_automatico_com_llm_simulado(cliente_para, monkeypatch):
    from dataclasses import replace

    from coletor.adaptadores import automatico as mod
    monkeypatch.setattr(mod, "config", replace(mod.config, anthropic_api_key="teste"))
    base = "https://www.leiloeiro-auto.com.br"
    cli = cliente_para({base + "/imoveis": "automatico_lista.html", base + "/leilao/imovel/5501": "automatico_lote.html"})
    enviado = {}

    def llm(req: httpx.Request):
        enviado["corpo"] = json.loads(req.content)
        return httpx.Response(200, json={"content": [{"type": "tool_use", "name": "registrar_lote", "input": {
            "eh_lote_de_imovel": True, "titulo": "Chácara 2 ha em Planaltina-DF", "tipo": "rural",
            "modalidade": "extrajudicial", "uf": "DF", "cidade": "Planaltina", "valor_avaliacao": 420000,
            "data_praca1": "2026-11-20T10:00", "valor_praca1": 420000, "data_praca2": "2026-12-04T10:00",
            "valor_praca2": 252000, "ocupacao": "nao_informado"}}]})

    fonte = {"id": "auto", "tipo": "automatico", "inicio": [base + "/imoveis"], "padrao_link_lote": r"/leilao/imovel/\d+"}
    ad = Automatico(fonte, cli, llm_transport=httpx.MockTransport(llm))
    lotes = list(ad.coletar())
    assert len(lotes) == 1 and ad.chamadas_llm == 1
    texto_enviado = enviado["corpo"]["messages"][0]["content"]
    assert "var x=1" not in texto_enviado and "menu" not in texto_enviado  # script e navegação removidos
    l = normalizar(lotes[0])
    assert l.tipo == "rural" and l.valor_praca2 == Decimal("252000.00")
    assert l.url == base + "/leilao/imovel/5501"


def test_rotulo_em_formatos_comuns():
    from bs4 import BeautifulSoup

    from coletor.adaptadores.extracao import Extrator
    html = """<ul><li>Endereço: SQN 408 Bloco X Apto 101</li><li>Cidade: Brasília / DF</li></ul>
              <p><b>Área privativa:</b> 98,00 m²</p>
              <dl><dt>Avaliação</dt><dd>R$ 1.150.000,00</dd></dl>"""
    ex = Extrator(BeautifulSoup(html, "lxml"))
    assert ex.campo({"rotulo": "Endereço"}) == "SQN 408 Bloco X Apto 101"
    assert ex.campo({"rotulo": "Área privativa"}) == "98,00 m²"
    assert ex.campo({"rotulo": "Avaliação"}) == "R$ 1.150.000,00"
    assert ex.campo({"rotulo": "Inexistente", "padrao": "x"}) == "x"


def test_teto_global_diario_de_chamadas_llm(conn):
    fonte = {"id": "auto", "tipo": "automatico", "inicio": ["https://x.com.br"]}
    ad = Automatico(fonte, None, conn=conn)
    with conn.cursor() as cur:
        cur.execute("update llm_orcamento set max_chamadas_dia = 3 where nome = 'coletor'")
    conn.commit()
    assert [ad._reservar_chamada_global() for _ in range(5)] == [True, True, True, False, False]
    with conn.cursor() as cur:
        cur.execute("select chamadas from llm_uso_coletor")
        assert [l["chamadas"] for l in cur.fetchall()] == [3]  # não passa do teto
        cur.execute("update llm_orcamento set max_chamadas_dia = 0 where nome = 'coletor'")
    conn.commit()
    assert ad._reservar_chamada_global() is False  # zero bloqueia tudo
    assert Automatico(fonte, None)._reservar_chamada_global() is True  # sem banco, sem teto global
