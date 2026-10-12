"""Leitura sem IA do JSON embutido (`var lote = {...}`) da família Leilão PRO."""
import json
from decimal import Decimal

from coletor.adaptadores import Automatico
from coletor.adaptadores import estruturado
from coletor.normalizar import normalizar
from tests.conftest import FIX


def _html(nome):
    return (FIX / nome).read_text(encoding="utf-8")


def test_le_json_embutido_com_bem():
    c = estruturado.ler(_html("var_lote_leilaobrasil.html"))
    assert c["uf"] == "SP" and c["cidade"] == "São Paulo" and c["bairro"] == "Jardim Paulista"
    assert c["valor_avaliacao"] == 447523.74 and c["valor_praca2"] == 313266.62
    assert c["data_praca1"] == "2026-11-03T10:02" and c["data_praca2"] == "2026-11-27T10:02"
    assert c["modalidade"] == "judicial" and c["processo"] == "10626113120218260100"
    assert c["leiloeiro"] == "IRANI FLORES"


def test_sem_bem_usa_cidade_uf_do_texto():
    texto = (FIX / "rotulos_trileiloes.txt").read_text(encoding="utf-8")
    c = estruturado.ler(_html("var_lote_trileiloes.html"), texto)
    assert (c["cidade"], c["uf"]) == ("Marau", "RS") and c["valor_praca1"] == 3100000
    assert "data_praca2" not in c and c["modalidade"] == "extrajudicial"


def test_sem_local_nao_arrisca():
    assert estruturado.ler(_html("var_lote_trileiloes.html"), "") is None


def test_luizlobato_local_vem_do_titulo():
    c = estruturado.ler(_html("var_lote_luizlobato.html"))
    # sem bem, sem datas no JSON: só aceita se o título trouxer "Cidade - UF" e houver valores
    assert c is None or (c["uf"] == "MG" and c["valor_praca1"] == 1800000)


def test_veiculo_e_pulado_e_status_estranho_segue_normal():
    o = estruturado.extrair_var_lote(_html("var_lote_leilaobrasil.html"))
    o["bem"]["tipoPai"] = "Veículos"
    assert estruturado.ler("<script>var lote = " + json.dumps(o) + ";</script>") is estruturado.NAO_IMOVEL
    o["bem"]["tipoPai"] = "Conjunto Comercial"
    o["status"] = 3
    assert estruturado.ler("<script>var lote = " + json.dumps(o) + ";</script>") is None


def test_pagina_sem_json_devolve_none():
    assert estruturado.ler("<html>nada</html>") is None
    assert estruturado.extrair_var_lote("var lote = {quebrado") is None


def test_chaves_dentro_de_string_nao_quebram():
    h = 'var lote = {"a": "}{ \\" }", "b": {"c": 1}}; var outro = 2;'
    assert estruturado.extrair_var_lote(h) == {"a": '}{ " }', "b": {"c": 1}}


def test_automatico_le_lote_sem_chamar_ia(cliente_para):
    base = "https://www.sitex.com.br"
    cli = cliente_para({
        base + "/imoveis": '<a href="/lote/13336/loja">x</a>',
        base + "/lote/13336/loja": "var_lote_leilaobrasil.html",
    })
    fonte = {"id": "x", "tipo": "automatico", "inicio": [base + "/imoveis"], "padrao_link_lote": r"/lote/\d+", "sem_preset": True}
    a = Automatico(fonte, cli)  # sem chave de IA: se tentasse usar a IA, falharia
    lotes = list(a.coletar())
    assert a.chamadas_llm == 0 and a.lidos_sem_ia == 1 and len(lotes) == 1
    n = normalizar(lotes[0], {})
    assert n.id_externo == "13336" and n.uf == "SP" and n.tipo == "comercial"
    assert n.valor_praca2 == Decimal("313266.62")


def test_paginas_de_evento_sao_ignoradas():
    b = "https://www.leilaobrasil.com.br/eventos/leilao/"
    assert estruturado.pagina_de_evento(b + "4654/veiculos-com-direito-a-documentacao")
    assert not estruturado.pagina_de_evento(b + "4533/apartamento-em-santo-amaro/lote")  # redireciona para o lote real
    assert not estruturado.pagina_de_evento(b + "casa-em-ervalia-mg/lote/24267/casa-em-ervalia-mg")


def test_categoria_da_url_e_datas_do_texto():
    base = "https://www.x.com.br/oferta/leilao/"
    o = estruturado.extrair_var_lote(_html("var_lote_luizlobato.html"))
    h = "<script>var lote = " + json.dumps(o) + ";</script>"
    texto = (FIX / "rotulos_luizlobatoleiloeiro.txt").read_text(encoding="utf-8")
    r, _ = estruturado.ler_com_motivo(h, texto, base + "materiais-equipamentos/equipamento-industrial/57/id-57/x")
    assert r is estruturado.NAO_IMOVEL
    c, _ = estruturado.ler_com_motivo(h, texto, base + "imoveis/terreno/80/id-80/x")
    assert c["uf"] == "MG" and c["data_praca2"] == "2027-07-15T07:00" and c["valor_praca2"] == 900000
    assert estruturado.pagina_de_evento("https://www.x.com.br/leiloes/142?classificacao=Im%C3%B3veis")


def test_link_que_cai_na_home_nao_gasta_ia(cliente_para):
    base = "https://www.sitex.com.br"
    cli = cliente_para({
        base + "/imoveis": '<a href="/eventos/leilao/old/lote/2/x">x</a><a href="/eventos/leilao/9/y/lote">y</a>',
        base + "/eventos/leilao/old/lote/2/x": "<html>home sem lote</html>",
        base + "/eventos/leilao/9/y/lote": "var_lote_leilaobrasil.html",
    })
    fonte = {"id": "x", "tipo": "automatico", "inicio": [base + "/imoveis"], "padrao_link_lote": r"/eventos/leilao/.+/lote", "sem_preset": True}
    a = Automatico(fonte, cli)
    a.url_final = base + "/"
    assert a._foi_para_home(base + "/eventos/leilao/old/lote/2/x") is True
    a.url_final = base + "/eventos/leilao/9/y/lote"
    assert a._foi_para_home(base + "/eventos/leilao/9/y/lote") is False


def test_links_seguem_o_dominio_final_do_redirecionamento():
    import httpx

    from coletor.http import Cliente

    def h(req: httpx.Request):
        u = str(req.url)
        if u.endswith("/robots.txt"):
            return httpx.Response(404)
        if u.startswith("https://velho.com.br"):
            return httpx.Response(302, headers={"location": "https://novo.com.br/"})
        if u == "https://novo.com.br/":
            return httpx.Response(200, text='<a href="/eventos/leilao/x/lote/5/y">y</a>')
        return httpx.Response(404)

    cli = Cliente(intervalo=0, transport=httpx.MockTransport(h))
    a = Automatico({"id": "x", "tipo": "automatico", "inicio": ["https://velho.com.br"], "padrao_link_lote": r"/lote/\d+"}, cli)
    assert a.descobrir_links() == ["https://novo.com.br/eventos/leilao/x/lote/5/y"]


def test_paginas_de_navegacao_nao_sao_lote():
    b = "https://www.morescoleiloes.com.br"
    for u in ("/leilao/x-15-09-2026/lotes/lista", "/leilao/x/planilha", "/leilao/x/online", "/leilao/auditorio-360", "/arrematante/login"):
        assert estruturado.pagina_de_evento(b + u), u
    assert not estruturado.pagina_de_evento(b + "/venda-direta/bem_id/129")
