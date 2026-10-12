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


def test_json_api_leiloes_judiciais_sem_ia():
    """YAML real da fonte contra uma resposta no formato da API (get-lotes)."""
    import httpx
    from decimal import Decimal

    from coletor.adaptadores import TIPOS
    from coletor.http import Cliente
    from coletor.registro import carregar

    item = {"lote_id": 219008, "leilao_id": 99955, "nm_titulo_lote": "Grande imóvel - Terreno 21.404m² - B. Rio Branco",
            "nm_descricao": '<p style="x"><span>Imóvel <b>desocupado</b> em Porto Alegre/RS.</span></p>',
            "dt_fechamento": "2026-11-16 10:00:00-03", "vl_lanceminimo": "158894328.00", "vl_lanceinicial": "79447164.00",
            "vl_lanceinicialsegundoleilao": None, "nm_cidade": "Porto Alegre", "nm_estado": "RS", "nm_statuslote": "Aberto para Lance",
            "nm_subcategoria": "Comerciais", "nm_leiloeiro": "Joyce Ribeiro",
            "fotos": [{"nm_path_completo": "https://s3.example/I_1.webp"}]}
    visto = {}

    def h(req: httpx.Request):
        if str(req.url).endswith("/robots.txt"):
            return httpx.Response(404)
        visto["metodo"], visto["q"] = req.method, dict(req.url.params)
        pg = int(req.url.params["pg"])
        return httpx.Response(200, json={"items": [item] if pg == 1 else [], "totalPages": 1})

    fonte = carregar()["leiloes-judiciais"]
    ad = TIPOS[fonte["tipo"]](fonte, Cliente(intervalo=0, transport=httpx.MockTransport(h)), conn=None)
    lotes = list(ad.coletar())
    assert visto["metodo"] == "POST" and visto["q"]["tipo"] == "3" and visto["q"]["qtd_por_pagina"] == "50"
    assert len(lotes) == 1
    from coletor.normalizar import normalizar
    n = normalizar(lotes[0], ad.padroes)
    assert n.id_externo == "219008" and n.url == "https://www.leiloesjudiciais.com.br/lote/99955/219008"
    assert n.cidade == "Porto Alegre" and n.uf == "RS" and n.tipo == "comercial"
    assert n.valor_avaliacao == Decimal("158894328.00") and n.lance_minimo == Decimal("79447164.00")
    assert n.data_praca1.day == 16 and n.data_praca1.hour == 10
    assert "<" not in (n.descricao or "") and n.ocupacao == "desocupado"


def test_lancevip_sem_ia():
    from pathlib import Path
    from coletor.adaptadores import estruturado as e
    pasta = Path(__file__).parent / "fixtures"
    carro, _ = e.ler_com_motivo((pasta / "lancevip_carro.html").read_text(encoding="utf-8"), "", "https://lancevip.com.br/leilao/2734/lote/1")
    assert carro is e.NAO_IMOVEL
    casa, motivo = e.ler_com_motivo((pasta / "lancevip_casa.html").read_text(encoding="utf-8"), "", "https://lancevip.com.br/leilao/2719/lote/2")
    assert isinstance(casa, dict), motivo
    assert casa["cidade"] == "São Miguel do Guaporé" and casa["uf"] == "RO"
    assert casa["valor_avaliacao"] == 460000.0 and casa["lance_minimo"] == 276000.0
    assert casa["modalidade"] == "venda_direta" and casa["id_externo"] == "2719-2"
    assert "Matrícula" in casa["descricao"]


def test_leiloariasmart_sem_ia():
    from pathlib import Path
    from coletor.adaptadores import estruturado as e
    html = (Path(__file__).parent / "fixtures" / "smart_casa.html").read_text(encoding="utf-8")
    r, motivo = e.ler_com_motivo(html, "", "https://leiloariasmart.com.br/imovel/1844")
    assert isinstance(r, dict), motivo
    assert r["cidade"] == "Miguel Pereira" and r["uf"] == "RJ" and r["id_externo"] == "1844"
    assert r["valor_praca1"] == 307902.03 and r["valor_praca2"] == 216330.69
    assert r["lance_minimo"] == 216330.69  # 1ª praça já encerrada
    assert r["modalidade"] == "extrajudicial" and r["ocupacao"] == "ocupado"


def test_frazao_sem_ia():
    from pathlib import Path
    from coletor.adaptadores import estruturado as e
    html = (Path(__file__).parent / "fixtures" / "frazao_lote.html").read_text(encoding="utf-8")
    r, motivo = e.ler_com_motivo(html, "", "https://www.frazaoleiloes.com.br/lote/41361-x")
    assert isinstance(r, dict), motivo
    assert r["cidade"] == "São Paulo" and r["uf"] == "SP" and r["bairro"] == "Bela Vista"
    assert r["lance_minimo"] == 6948800.0 and r["data_praca1"] == "2026-09-30T10:00"
    assert r["id_externo"] == "41361" and r["ocupacao"] == "ocupado"
    assert e.pagina_de_evento("https://www.frazaoleiloes.com.br/leilao/3706/leilao-x-3706")
    assert not e.pagina_de_evento("https://lancevip.com.br/leilao/2734/lote/1")


def test_frazao_itau_duas_pracas():
    from pathlib import Path
    from coletor.adaptadores import estruturado as e
    html = (Path(__file__).parent / "fixtures" / "frazao_itau.html").read_text(encoding="utf-8")
    r, motivo = e.ler_com_motivo(html, "", "https://www.frazaoleiloes.com.br/lote/41986-x")
    assert isinstance(r, dict), motivo
    assert r["cidade"] == "Ituiutaba" and r["uf"] == "MG" and r["bairro"] == "Centro"
    assert r["data_praca1"] == "2026-09-28T16:00" and r["valor_praca1"] == 296640.29
    assert r["data_praca2"] == "2026-10-13T16:00" and r["valor_praca2"] == 247169.39
    assert r["lance_minimo"] == 247169.39
