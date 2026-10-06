"""Leitores sem IA (Mega Leilões, Seu Imóvel BB, Santander), sondagem de fontes vazias e cache com prazo de revisão."""
import json
from decimal import Decimal

from coletor.adaptadores import Automatico, Seletores
from coletor.normalizar import normalizar


def test_mega_leiloes_por_seletores_sem_ia(cliente_para):
    from coletor.registro import carregar
    fonte = carregar()["mega-leiloes"]
    assert fonte["tipo"] == "seletores"
    url = "https://www.megaleiloes.com.br/imoveis?pagina={}"
    cli = cliente_para({url.format(1): "mega_lista.html", url.format(2): "mega_lista.html"})  # 2ª repete: fim da paginação
    lotes = list(Seletores(fonte, cli).coletar())
    assert len(lotes) == 2
    a, b = (normalizar(x, {}) for x in lotes)
    assert a.id_externo == "X129793" and a.tipo == "casa" and a.uf == "SP" and a.cidade == "Aramina"
    assert a.modalidade == "extrajudicial" and a.lance_minimo == Decimal("205200.00")
    assert a.url == "https://www.megaleiloes.com.br/imoveis/casas/sp/aramina/casa-213-m2-santo-antonio-aramina-sp-x129793"
    assert a.data_praca1.day == 7 and a.data_praca1.hour == 12 and a.valor_praca1 == Decimal("205200.00")
    assert b.tipo == "apartamento" and b.modalidade == "judicial" and b.uf == "RJ"
    assert b.valor_praca1 == Decimal("937535.46") and b.valor_praca2 == Decimal("852151.57") and b.data_praca2.day == 9


def test_seu_imovel_bb_post_html(cliente_para):
    from coletor.adaptadores import PostHtml
    from coletor.registro import carregar
    fonte = carregar()["seu-imovel-bb"]
    card = """<div class="col-lg-3"><div class="card carta"><div class="foto-container"><a href="/imovel/id/12210">
      <div class="tipo"><i></i> Casa</div></a></div><div class="card-body"><a href="/imovel/id/12210"><div class="valor">Aceita BB?</div></a>
      <i class="compartilhar" onclick="_compartilhar('ID96670 ÁGUA BRANCA (PI)Descrição legal: Imóvel Urbano Residencial, Casa situada na Rua Projetada 08', 'http://seuimovelbb.com.br/imovel/id/12210');"></i>
      <div class="localidade"><i></i> Água Branca - PI</div><div class="leilao"><i></i> Leilão - ID 96670</div><div class="leilao"><i></i> Terça, 13/10 às 10h</div></div></div></div>
      <div class="col-lg-3"><div class="card carta"><a href="/imovel/id/12234"><div class="tipo">Prédio</div></a><a href="/imovel/id/12234"><div class="valor">R$ 127.000,00</div></a>
      <div class="localidade">Venâncio Aires - RS</div><div class="leilao">Venda direta - ID 5</div></div></div>"""
    cli = cliente_para({
        "https://seuimovelbb.com.br/catalogo/categoria/urbanos": '<html><div id="_cppnp">tok123</div></html>',
        "https://seuimovelbb.com.br/catalogo": {"lista": card, "imoveis": "2", "paginacao": ""},
    })
    lotes = list(PostHtml(fonte, cli).coletar())
    assert len(lotes) == 2
    a, b = (normalizar(x, {"comitente": "Banco do Brasil"}) for x in lotes)
    assert a.id_externo == "12210" and a.url == "https://seuimovelbb.com.br/imovel/id/12210"
    assert a.tipo == "casa" and a.uf == "PI" and a.cidade == "Água Branca" and a.modalidade == "outros"
    assert a.data_praca1 is not None and a.data_praca1.day == 13 and a.data_praca1.month == 10 and a.data_praca1.hour == 10
    assert "Imóvel Urbano Residencial" in a.descricao
    assert b.lance_minimo == Decimal("127000.00") and b.modalidade == "venda_direta" and b.tipo == "comercial"


def test_santander_wordpress_rest_sem_ia(cliente_para):
    from coletor.adaptadores import WordpressRest
    from coletor.registro import carregar
    fonte = carregar()["santander-imoveis"]
    link = "https://www.santanderimoveis.com.br/venda/imovel/casa-a-venda-na-rua-benjamim-constant-mongagua-sp-codigo-02-25830-santander-imoveis/"
    lista = json.dumps([{"id": 334157, "modified": "2026-10-06T08:42:48", "link": link,
                         "title": {"rendered": "Casa à venda na Rua Benjamim Constant &#8211; Mongaguá/SP Código: 02.25830 | Santander Imóveis"}}])
    cli = cliente_para({"https://www.santanderimoveis.com.br/wp-json/wp/v2/estate_property": lista, link: "santander_imovel.html"})
    lotes = list(WordpressRest(fonte, cli).coletar())
    assert len(lotes) == 1
    l = normalizar(lotes[0], {"comitente": "Santander"})
    assert l.id_externo == "02.25830" and l.tipo == "casa" and l.uf == "SP" and l.cidade == "Mongaguá"
    assert l.valor_avaliacao == Decimal("248000.00") and l.lance_minimo == Decimal("28508.00")
    assert l.ocupacao == "ocupado" and l.matricula == "12.520"
    assert l.data_praca1.year == 2026 and l.data_praca1.month == 10 and l.data_praca1.hour == 11
    assert l.area_terreno == Decimal("126") and l.area_privativa == Decimal("57")
    assert "Biasi" in (l.leiloeiro or "") and "DESOCUPAÇÃO" in l.descricao


def test_wordpress_rest_reaproveita_imovel_nao_modificado(conn):
    from coletor.adaptadores import WordpressRest
    ad = WordpressRest({"id": "x", "tipo": "wordpress_rest"}, None, conn=conn)
    assert ad._ler_cache("wp:u") is None
    ad._gravar_cache("wp:u", "2026-10-06T08:00:00", {"titulo": "A", "id_externo": "1"})
    assert ad._ler_cache("wp:u") == ("2026-10-06T08:00:00", {"titulo": "A", "id_externo": "1"})


def test_sondagem_classifica_fontes_vazias(cliente_para):
    from coletor.sondagem import sondar_fonte
    com = '<html><body><a href="/leilao/imovel/5501">x</a></body></html>'
    js = "<html><body><div id=root></div><script></script><script></script><script></script></body></html>"
    sem = "<html><body>" + "Nenhum imóvel disponível. " * 3 + "</body></html>"
    cli = cliente_para({"https://a.com.br/": com, "https://b.com.br/": js, "https://c.com.br/": sem})
    assert sondar_fonte({"id": "a", "tipo": "automatico", "inicio": ["https://a.com.br/"], "padrao_link_lote": r"/leilao/imovel/\d+"}, cli)["veredito"] == "lotes_no_html"
    assert sondar_fonte({"id": "b", "tipo": "automatico", "inicio": ["https://b.com.br/"]}, cli)["veredito"] == "js"
    assert sondar_fonte({"id": "c", "tipo": "automatico", "inicio": ["https://c.com.br/"]}, cli)["veredito"] == "sem_lotes"
    assert sondar_fonte({"id": "d", "tipo": "automatico", "inicio": ["https://d.com.br/"]}, cli)["veredito"] == "erro_http"


def test_cache_prazo_de_revisao_respeita_urgencia_e_conta_uso_por_fonte(conn):
    ad = Automatico({"id": "auto", "tipo": "automatico", "inicio": ["https://x.com.br"]}, None, conn=conn)
    ad._reservar_chamada_global()
    ad._reservar_chamada_global()
    with conn.cursor() as cur:
        cur.execute("select chamadas from llm_uso_fonte where fonte_id = 'auto'")
        assert cur.fetchone()["chamadas"] == 2
        cur.execute("insert into fonte (id, nome, tipo_adaptador) values ('auto', 'Auto', 'automatico') on conflict do nothing")
        cur.execute("insert into pagina_cache (url, hash_texto, extraido) values ('u1', 'h', '{}')")
        cur.execute("insert into lote (fonte_id, id_externo, url, status, hash_conteudo, data_praca1) values ('auto', '1', 'u1', 'ativo', 'x', now() + interval '60 days')")
    conn.commit()
    assert ad._cache_revisao("u1")["recente"] is True            # tranquila e lida há pouco: não relê
    with conn.cursor() as cur:
        cur.execute("update lote set data_praca1 = now() + interval '2 days'")
    conn.commit()
    assert ad._cache_revisao("u1")["recente"] is False           # leilão em 2 dias: urgente, confere sempre
    with conn.cursor() as cur:
        cur.execute("update lote set data_praca1 = now() + interval '60 days'")
        cur.execute("update pagina_cache set atualizado_em = now() - interval '10 days'")
    conn.commit()
    assert ad._cache_revisao("u1")["recente"] is False           # lida há mais de 3 dias: confere
