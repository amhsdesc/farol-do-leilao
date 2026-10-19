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


def test_leilaovip_sem_ia_e_descoberta():
    from pathlib import Path
    from coletor.adaptadores import descobertas, estruturado as e
    pasta = Path(__file__).parent / "fixtures"
    r, motivo = e.ler_com_motivo((pasta / "leilaovip_casa.html").read_text(encoding="utf-8"), "",
                                 "https://www.leilaovip.com.br/evento/anuncio/casa-com-38718-m-parque-sao-quirino-02-22408")
    assert isinstance(r, dict), motivo
    assert r["cidade"] == "Campinas" and r["uf"] == "SP" and r["id_externo"] == "22408"
    assert r["valor_praca1"] == 3783185.8 and r["valor_praca2"] == 2269911.48 and r["lance_minimo"] == 2269911.48
    assert r["modalidade"] == "judicial"
    assert len(descobertas.eventos_da_agenda((pasta / "leilaovip_agenda.html").read_text(encoding="utf-8"))) == 24
    assert len(descobertas.anuncios_do_evento((pasta / "leilaovip_evento.html").read_text(encoding="utf-8"))) == 12
    assert e.pagina_de_evento("https://www.leilaovip.com.br/evento/detalhes/131026af1pan")


def test_texto_estavel_ignora_contadores():
    from coletor.adaptadores.automatico import texto_estavel
    a = "Casa em Campinas\nVisitas:\n1211\nLance inicial R$ 100.000,00\nFinalizando Em:\n1 dia, 18 h, 52 min e 19 seg\n"
    b = "Casa em Campinas\nVisitas:\n1290\nLance inicial R$ 100.000,00\nFinalizando Em:\n1 dia, 17 h, 10 min e 02 seg\n"
    assert texto_estavel(a) == texto_estavel(b)
    c = a.replace("100.000,00", "90.000,00")
    assert texto_estavel(a) != texto_estavel(c)
    d = "3285 visualizações\nBOX NA PENHA\n"
    assert "BOX NA PENHA" in texto_estavel(d) and "3285" not in texto_estavel(d)


def test_texto_estavel_preserva_datas_e_precos():
    from coletor.adaptadores.automatico import texto_estavel
    a = "Encerra em: 20/10/2026 14:00\nLance inicial R$ 100.000,00\nVisitas:\n10\n"
    b = a.replace("20/10/2026", "27/10/2026")
    c = a.replace("100.000,00", "80.000,00")
    assert texto_estavel(a) != texto_estavel(b)  # data mudou: precisa reler
    assert texto_estavel(a) != texto_estavel(c)  # preço mudou: precisa reler
    assert texto_estavel(a) == texto_estavel(a.replace("\n10\n", "\n99\n"))  # só visitas: não reler
    d = "Termina em:\n20/10/2026 14:00\n"
    assert texto_estavel(d) == d.rstrip("\n") or "20/10/2026" in texto_estavel(d)


def test_sfrazao_lote_com_lance_e_sem_lance():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo
    base = Path(__file__).parent / "fixtures"
    r, _ = ler_com_motivo((base / "sfrazao_lote10463.html").read_text(encoding="utf-8"), "", "https://www.sfrazao.com.br/lote.php?idLote=10463")
    assert r["cidade"] == "Piracicaba" and r["uf"] == "SP" and r["valor_praca1"] == 192000.0 and r["valor_avaliacao"] == 320000.0
    assert r["data_praca1"] == "2026-10-19T16:00" and r["id_externo"] == "10463"
    r, _ = ler_com_motivo((base / "sfrazao_lote7217.html").read_text(encoding="utf-8"), "", "https://www.sfrazao.com.br/lote.php?idLote=7217")
    assert r["cidade"] == "Guarujá" and r["uf"] == "SP" and r["valor_praca1"] == 300000.0


def test_sfrazao_lote_vendido_vira_encerrado_e_titulo_residencia():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo
    h = (Path(__file__).parent / "fixtures" / "sfrazao_lote7217.html").read_text(encoding="utf-8")
    h = h.replace("Em leilão", "Vendido", 1).replace("Apto c/ 181,44m² AP em Enseada", "Residência com 3 Suítes em Enseada", 1)
    r, motivo = ler_com_motivo(h, "", "https://www.sfrazao.com.br/lote.php?idLote=7217")
    assert r and r["status"] == "encerrado" and r["cidade"] == "Guarujá", motivo


def test_sfrazao_sublote_com_titulo_curto_e_areia():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo, NAO_IMOVEL
    h = (Path(__file__).parent / "fixtures" / "sfrazao_lote7217.html").read_text(encoding="utf-8")
    url = "https://www.sfrazao.com.br/lote.php?idLote=7217"
    r, motivo = ler_com_motivo(h.replace("Apto c/ 181,44m² AP em Enseada, Guarujá-SP", "A"), "", url)
    assert r is not NAO_IMOVEL and (r is None or r["titulo"].startswith("A")), motivo
    r, _ = ler_com_motivo(h.replace("Apto c/ 181,44m² AP em Enseada, Guarujá-SP", "140m³ de areia grossa"), "", url)
    assert r is NAO_IMOVEL


def test_sfrazao_endereco_com_cidade_e_uf_rotulados():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo
    h = (Path(__file__).parent / "fixtures" / "sfrazao_lote702.html").read_text(encoding="utf-8")
    r, motivo = ler_com_motivo(h, "", "https://www.sfrazao.com.br/lote.php?idLote=702")
    assert r and r["uf"] == "SP" and r["cidade"].lower() == "itapetininga", motivo


def test_casadeleiloes_imovel_e_nao_imovel():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo, NAO_IMOVEL
    base = Path(__file__).parent / "fixtures"
    u = "https://www.casadeleiloes.com.br/lote/lote-001/x/"
    r, _ = ler_com_motivo((base / "casadeleiloes_imovel66809.html").read_text(encoding="utf-8"), "", u + "66809")
    assert r["uf"] == "MS" and r["cidade"].lower() == "corumbá" and r["valor_praca1"] == 150000.0 and r["data_praca1"] == "2026-10-31T17:00"
    r, motivo = ler_com_motivo((base / "casadeleiloes_imovel66967.html").read_text(encoding="utf-8"), "", u + "66967")
    assert r and r["uf"] == "MS" and "dourados" in r["cidade"].lower(), motivo
    r, _ = ler_com_motivo((base / "casadeleiloes_veiculo.html").read_text(encoding="utf-8"), "", u + "66916")
    assert r is NAO_IMOVEL


def test_leilotech_snapshot_imovel_e_veiculo():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo, NAO_IMOVEL
    base = Path(__file__).parent / "fixtures"
    r, motivo = ler_com_motivo((base / "leilotech_apto.html").read_text(encoding="utf-8"), "", "https://vasconcelosleiloes.com.br/lote/480/x")
    assert r and r["uf"] == "SC" and r["cidade"] == "Barra Velha" and r["valor_avaliacao"] == 300000.0 and r["id_externo"] == "480", motivo
    r, _ = ler_com_motivo((base / "leilotech_fiat.html").read_text(encoding="utf-8"), "", "https://vasconcelosleiloes.com.br/lote/524/x")
    assert r is NAO_IMOVEL


def test_biasi_lote_imovel_duas_pracas():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo
    base = Path(__file__).parent / "fixtures"
    r, motivo = ler_com_motivo((base / "biasi_lote62735.html").read_text(encoding="utf-8"), "", "https://www.biasileiloes.com.br/sale/detail?id=62735")
    assert r, motivo
    assert r["uf"] == "BA" and r["cidade"] == "Vitória da Conquista" and r["valor_praca1"] == 839120.55
    assert r["valor_praca2"] == 385709.87 and r["data_praca1"] == "2026-10-13T15:00" and r["data_praca2"] == "2026-10-15T15:00"
    assert r["status"] == "aberto" and r["id_externo"] == "62735"
    r, motivo = ler_com_motivo((base / "biasi_lote63763.html").read_text(encoding="utf-8"), "", "https://www.biasileiloes.com.br/sale/detail?id=63763")
    assert r and r["uf"] == "SP" and r["cidade"] == "Mauá" and r["valor_praca2"] == 194835.05, motivo


def test_itemleilao_cravo_central_brasilia():
    from pathlib import Path
    from coletor.adaptadores.estruturado import ler_com_motivo
    base = Path(__file__).parent / "fixtures"
    def le(nome, url):
        return ler_com_motivo((base / f"itemleilao_{nome}.html").read_text(encoding="utf-8"), "", url)
    r, m = le("cravo_item12321", "https://www.cravoleiloes.com.br/item/12321/detalhes")
    assert r and r["cidade"] == "Salvador" and r["uf"] == "BA" and r["valor_praca1"] == 190000.0 and r["valor_praca2"] == 97000.0, m
    assert r["data_praca1"] == "2026-10-20T14:00" and r["data_praca2"] == "2026-10-27T14:00" and r["id_externo"] == "12321"
    r, m = le("cravo_item12594", "https://www.cravoleiloes.com.br/item/12594/detalhes")
    assert r and r["valor_praca1"] == 1000000.0 and r["data_praca1"] == "2026-10-18T15:00", m  # venda por proposta
    r, m = le("central_item7866", "https://www.centraldosleiloes.com.br/item/7866/detalhes?page=1")
    assert r and r["valor_avaliacao"] == 200000.0 and r["valor_praca1"] == 120000.0, m  # 'Sem licitante', data 'Em breve'
    r, m = le("brasilia_item5539", "https://www.leiloeirosdebrasilia.com.br/item/5539/detalhes")
    assert r and r["uf"] == "DF" and r["valor_praca2"] == 2575628.61, m


def test_fotos_do_json_embutido_lance_vip_e_capa_generica():
    fotos_genericas = estruturado.fotos_genericas

    base = (FIX / "var_lote_leilaobrasil.html").read_text(encoding="utf-8")
    lido, _ = estruturado.ler_com_motivo(base, "", "https://x.com.br/oferta/imoveis/lote/1")
    assert lido["fotos"] == ["https://static.suporteleiloes.com.br/leilaobrasil/leiloes/lotes/imagens/064f1e317087f4.jpg"]
    casa = (FIX / "lancevip_casa.html").read_text(encoding="utf-8")
    lido, _ = estruturado.ler_com_motivo(casa, "", "https://www.lancevip.com.br/x")
    assert len(lido["fotos"]) == 2 and all("/bens/35336/" in f for f in lido["fotos"])  # fotos de lotes parecidos ficam de fora
    # og:image genérico: vale a capa do lote, não o logotipo do site
    assert fotos_genericas('<meta property="og:image" content="/img/lote1.jpg">', "https://a.com/l/1") == ["https://a.com/img/lote1.jpg"]
    assert fotos_genericas('<meta property="og:image" content="https://a.com/assets/logo.jpg">', "https://a.com") == []


def test_fotos_da_galeria_suporte_leiloes_sem_og_image_nem_bem_no_json():
    """Leilões Monteiro, lote 4780: sem og:image e com `bem` vazio no topo do var lote; as fotos só estão no HTML."""
    s = "https://static.suporteleiloes.com.br/leiloesmonteirocombr/bens/"
    capa = s + "4776/arquivos/sl-bem-4776-aaa-bbb.jpg"
    json_lote = ('{"id":4780,"leilao":{"stats":{"lote":{"id":4780,"bem":{"id":4776,"image":{"full":{"url":"'
                 + capa.replace("/", "\\/") + '"}}}}}}}')
    html = (
        "<html><body>"
        f'<img src="{s}4776/arquivos/sl-bem-4776-aaa-bbb.jpg"><img src="{s}4776/arquivos/sl-bem-4776-ccc-ddd.png">'
        f'<img src="{s}4776/arquivos/sl-bem-4776-eee-fff.jpg"><img src="{s}4776/arquivos/sl-bem-4776-eee-fff.jpg">'
        f'<img src="{s}4776/arquivos/6aa83aec538e7-6aa83aec5873a.jpg">'  # miniatura: sem "sl-bem-"
        f'<a href="{s}4776/arquivos/sl-bem-4776-ggg-hhh.pdf">Edital</a>'  # documento, não foto
        f'<img src="{s}4999/arquivos/sl-bem-4999-xxx-yyy.jpg">'  # foto de outro lote (parecidos)
        "<script>var lote = " + json_lote + ";</script></body></html>"
    )
    fotos = estruturado.fotos_genericas(html, "https://leiloesmonteiro.com.br/eventos/leilao/x/lote/4780/y")
    assert fotos == [s + "4776/arquivos/sl-bem-4776-aaa-bbb.jpg", s + "4776/arquivos/sl-bem-4776-ccc-ddd.png", s + "4776/arquivos/sl-bem-4776-eee-fff.jpg"]
    # sem var lote para saber qual é o bem do lote: vale tudo que a galeria mostra (ainda sem PDF nem miniatura)
    sem_json = html.split("<script>")[0]
    assert len(estruturado.fotos_genericas(sem_json)) == 4
    # página de outra plataforma: nada muda
    assert estruturado.fotos_genericas("<html><img src='/a.jpg'></html>") == []


def test_cidade_no_inicio_do_titulo_e_bem_que_nao_e_imovel_nao_gasta_ia():
    assert estruturado._local({}, "RIO VERDE/GO - UMA CASA RESIDENCIAL COM 12 CÔMODOS", "") == ("Rio Verde", "GO", None)
    assert estruturado._local({}, "SANTA HELENA DE GOIÁS/GO - FAZENDA", "")[0] == "Santa Helena de Goiás"
    # veículo/equipamento com status diferente de 1: descartado sem IA (antes ia para a IA só para ser descartado)
    html = (FIX / "var_lote_leilaobrasil.html").read_text(encoding="utf-8")
    lote = estruturado.extrair_var_lote(html)
    lote["status"] = 0
    lote["bem"]["siteTitulo"] = "LANCHA TRITON 27.5 MARCA TRITON YACHTS"
    lote["bem"]["tipo"] = None
    lote["bem"]["tipoPai"] = None
    import coletor.adaptadores.estruturado as e
    original = e.extrair_var_lote
    e.extrair_var_lote = lambda h: lote
    try:
        r, motivo = e.ler_com_motivo(html, "", "https://x.com.br/eventos/leilao/1/lancha/lote/2/lancha")
    finally:
        e.extrair_var_lote = original
    assert r is e.NAO_IMOVEL, motivo


def test_leiloesjudiciais_nuxt_imovel_e_nao_imovel():
    html = (FIX / "leiloesjudiciais_imovel.html").read_text(encoding="utf-8")
    d, motivo = estruturado.ler_com_motivo(html, "", "https://www.leiloesjudiciaismg.com.br/lote/100349/220217")
    assert isinstance(d, dict), motivo
    assert (d["cidade"], d["uf"], d["tipo"], d["status"]) == ("Pouso Alegre", "MG", "casa", "aberto")
    assert d["valor_avaliacao"] == 140000.0 and d["lance_minimo"] == 70000.0  # a página: Avaliação R$ 140.000 / Lance mínimo atual R$ 70.000
    assert d["data_praca1"] == "2026-09-25T16:00" and d["data_praca2"] == "2026-10-13T16:00"
    assert d["leiloeiro"] == "Alessandro de Assis Teixeira" and d["id_externo"] == "220217"
    assert len(d["fotos"]) == 3 and "/640x480/" in d["fotos"][0]
    lote = Automatico.montar(d, url="https://x/lote/1")  # o resultado vira LoteBruto sem erro
    assert lote and normalizar(lote).tipo == "casa"
    # vacas: o site tem de tudo; categoria 'Animais' é descartada sem IA
    animais = (FIX / "leiloesjudiciais_animais.html").read_text(encoding="utf-8")
    assert estruturado.ler_com_motivo(animais, "", "https://www.leiloesjudiciaismg.com.br/lote/100414/220351")[0] is estruturado.NAO_IMOVEL
