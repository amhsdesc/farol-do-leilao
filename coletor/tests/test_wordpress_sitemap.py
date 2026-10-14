"""Lista do Santander pelo sitemap (a API REST do site responde 403)."""
from coletor.adaptadores.wordpress_rest import WordpressRest

INDICE = """<?xml version="1.0"?><sitemapindex>
<sitemap><loc>https://x.com.br/post-sitemap.xml</loc><lastmod>2025-01-01</lastmod></sitemap>
<sitemap><loc>https://x.com.br/estate_property-sitemap1.xml</loc><lastmod>2026-10-14T12:15:00+00:00</lastmod></sitemap>
</sitemapindex>"""
FILHO = """<urlset>
<url><loc>https://x.com.br/venda/imovel/casa-a-venda-na-rua-a-camacari-ba-codigo-02-24533-santander-imoveis/</loc>
<lastmod>2026-09-29T15:35:46+00:00</lastmod><image:image><image:loc>https://x.com.br/f.jpg</image:loc></image:image></url>
<url><loc>https://x.com.br/venda/imovel/apto-b/</loc><lastmod>2026-10-01T10:00:00+00:00</lastmod></url>
</urlset>"""
PAGINA = "<html><body><h1>Casa</h1><p>Cód. 02.24533 Casa</p></body></html>"


class Resp:
    def __init__(self, text): self.text = text


class FakeCliente:
    def __init__(self): self.pedidos = []
    def get(self, url, **kw):
        self.pedidos.append(url)
        if url.endswith("sitemap_index.xml"): return Resp(INDICE)
        if "estate_property-sitemap1" in url: return Resp(FILHO)
        return Resp(PAGINA if "02-24533" in url else "<html><body>sem codigo</body></html>")


def _fonte():
    return {"id": "santander-imoveis", "comitente": "Santander", "uf": "todas",
            "requisicao": {"sitemap": "https://x.com.br/sitemap_index.xml", "sitemap_filtro": "estate_property"},
            "detalhe": {"campos": {"id_externo": {"texto_regex": r"Cód\. ([\d.]+)"}}}}


def test_lista_vem_so_dos_sitemaps_filtrados():
    c = FakeCliente()
    itens = list(WordpressRest(_fonte(), c)._itens())
    assert [i["link"].split("/")[-2] for i in itens] == [
        "casa-a-venda-na-rua-a-camacari-ba-codigo-02-24533-santander-imoveis", "apto-b"]
    assert itens[0]["modified"] == "2026-09-29T15:35:46+00:00"
    assert not any("post-sitemap" in u for u in c.pedidos)  # sitemap de posts não é lido


def test_coleta_le_a_pagina_e_usa_o_codigo_como_id():
    lotes = list(WordpressRest(_fonte(), FakeCliente()).coletar())
    assert lotes[0].id_externo == "02.24533"
    assert len(lotes) == 2 and lotes[1].id_externo.startswith("u")  # sem código na página: id estável pelo link
