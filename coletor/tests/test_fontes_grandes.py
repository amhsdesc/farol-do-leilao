"""Superbid, Zuk, Sicoob (Resale) e Bradesco lidos por API/HTML, sem IA. Estruturas copiadas dos sites reais."""
from decimal import Decimal

from coletor.adaptadores import JsonApi, PostHtml
from coletor.normalizar import normalizar
from coletor.registro import carregar

SB = "https://offer-query.superbid.net/offers/"


def test_superbid_api(cliente_para):
    fonte = carregar()["superbid"]
    oferta = {"id": 5012922, "endDate": "2026-10-07 10:00:00", "store": {"name": "ANDRÉ LUIZ LEILÕES"},
              "offerDetail": {"currentMinBid": 603395.41}, "auction": {"modalityDesc": "Leilão"},
              "product": {"shortDesc": "Apartamento Cond. Trentino II, 44,15m², Joinville/SC",
                          "location": {"city": "Joinville - SC"}, "galleryJson": [{"link": "https://ms.sbwebservices.net/photos/a.jpg"}]}}
    cli = cliente_para({SB: {"offers": [oferta]}})
    lotes = list(JsonApi(fonte, cli).coletar())
    assert len(lotes) == 1
    n = normalizar(lotes[0], {})
    assert n.id_externo == "5012922" and n.url == "https://www.superbid.net/oferta/5012922"
    assert n.cidade == "Joinville" and n.uf == "SC" and n.tipo == "apartamento" and n.lance_minimo == Decimal("603395.41")
    assert n.comitente == "ANDRÉ LUIZ LEILÕES"


def test_sicoob_resale_api(cliente_para):
    fonte = carregar()["sicoob-imoveis"]
    item = {"id_do_imovel": "IDR190571", "id_banco": "42532", "nome_imovel": "Lote, Residencial, Parque Flamboyant",
            "tipo_imovel": "Lote", "descricao": "Lote desocupado", "status_da_venda": "ativo", "data_melhor_proposta": "14/10/2026 11:00",
            "valores": {"valor_avaliado": 151300, "valor_venda": 145000},
            "endereco": {"endereco_completo": "Rua X, 123", "cidade": "Campos dos Goytacazes", "estado": "RJ"},
            "foto_capa": "https://d107brv7xtbumz.cloudfront.net/f14d"}
    url = "https://yfvun6xbh1.execute-api.us-east-2.amazonaws.com/prod/leilaosicoob/property/"
    cli = cliente_para({url: {"data": [item], "pagination": {"max_pages": 1}}})
    lotes = list(JsonApi(fonte, cli).coletar())
    n = normalizar(lotes[0], {})
    assert n.id_externo == "IDR190571" and n.uf == "RJ" and n.cidade == "Campos dos Goytacazes"
    assert n.url == "https://www.leilaosicoob.com.br/imovel/RJ/Campos-dos-Goytacazes/42532"
    assert n.lance_minimo == Decimal("145000") and n.valor_avaliacao == Decimal("151300") and n.modalidade == "venda_direta"


def test_bradesco_vitrine_sem_imoveis_e_com_imoveis(cliente_para):
    fonte = carregar()["bradesco-imoveis"]
    url = "https://api.vitrinebradesco.com.br/v1/auctions"
    assert list(JsonApi(fonte, cliente_para({url: {"total_pages": 0, "data": []}})).coletar()) == []
    item = {"guid": "g1", "name": "Casa em Barra do Garças", "slug": "casa-barra-1", "category": "Casa", "city": "Barra do Garças",
            "state": "MT", "price": 300000, "auction_date": "2026-10-20T13:00:00.000Z", "auctioneer": {"name": "Grupo Vip"}}
    lotes = list(JsonApi(fonte, cliente_para({url: {"total_pages": 1, "data": [item]}})).coletar())
    n = normalizar(lotes[0], {})
    assert n.uf == "MT" and n.tipo == "casa" and n.url.endswith("/auctions/casa-barra-1") and n.lance_minimo == Decimal("300000")


CARD = """<div class="card-property card_lotes_div"><div class="card-property-image-wrapper">
<a href="https://www.portalzuk.com.br/imovel/mg/itabirinha/moreira-sales/rua-jk-s-n/37613-234884" target="_blank"
 title=" em leilão - Rua JK, s/n - Itabirinha/MG - Banco Cooperativo Sicoob S.A. | Z37522"><img src="x"></a>
<span class="card-property-news"> Desocupado </span></div>
<div class="card-property-content"><ul class="card-property-prices"><li class="card-property-price"><span class="card-property-price-lote">Terreno</span></li>
<li><address class="card-property-address"><span style="font-weight: 600;"><a href="https://x/y">Itabirinha / MG</a> - Moreira Sales</span>
<span style="flex-basis: 100%;">Rua JK, s/n</span></address></li></ul>
<ul class="card-property-prices"><li class="card-property-price" data-pracas="1"><span class="card-property-price-label"> Valor </span>
<span class="card-property-price-value">R$ 112.000,00 <span class="card-property-price-percent">36</span></span>
<span class="card-property-price-data">09/10/2026 às 11:06</span></li></ul></div></div>"""


def test_zuk_post_html(cliente_para):
    fonte = carregar()["portal-zuk"]
    cli = cliente_para({
        "https://www.portalzuk.com.br/leilao-de-imoveis": '<html><form><input type="hidden" name="_token" value="tok9"></form></html>',
        "https://www.portalzuk.com.br/leilao-de-imoveis/mais": CARD,
    })
    lotes = list(PostHtml(fonte, cli).coletar())  # a 2ª página repete o mesmo card: fim da paginação
    assert len(lotes) == 1
    n = normalizar(lotes[0], {})
    assert n.id_externo == "37613-234884" and n.tipo == "terreno" and n.uf == "MG" and n.cidade == "Itabirinha"
    assert n.lance_minimo == Decimal("112000.00") and n.data_praca1.day == 9 and n.data_praca1.hour == 11
    assert "Sicoob" in (n.comitente or "")
