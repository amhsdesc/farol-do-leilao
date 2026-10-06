"""Presets de plataformas: leilao.pro lido sem IA a partir do site de qualquer leiloeiro."""
from decimal import Decimal

from coletor.adaptadores import Automatico
from coletor.normalizar import normalizar


def test_leilao_pro_sem_ia(cliente_para):
    fonte = {"id": "x", "nome": "X", "tipo": "automatico", "uf": ["MG"], "inicio": ["https://www.sitex.com.br"]}
    cli = cliente_para({
        "https://www.sitex.com.br": "leilaopro_lista.html",
        "https://www.sitex.com.br/leilao/lotes/imoveis": "leilaopro_lista.html",
    })
    a = Automatico(fonte, cli)  # sem chave de IA: se tentasse usar a IA, falharia
    lotes = list(a.coletar())
    assert a.chamadas_llm == 0 and len(lotes) == 1
    n = normalizar(lotes[0], {})
    assert n.id_externo == "533"
    assert n.url == "https://www.sitex.com.br/leilao/tjmg-8a-vara/lote_id/533"
    assert n.lance_minimo == Decimal("454907.52") and n.uf == "MG" and "Uberl" in (n.cidade or "")
    assert n.data_praca1.day == 7 and n.data_praca1.hour == 9


def test_suaplataforma_api_sem_ia(cliente_para):
    import httpx
    from coletor.http import Cliente
    from tests.conftest import transporte
    lote = {"ID_Leilao": 9, "ID_Leiloes_Lote": 10, "Leilao": "Terreno 34 - Birigui (SP)", "Categoria": "Terrenos",
            "LabelModalidade": "Extrajudicial", "Comitente": "FULANO", "Lote_Endereco": "Rodovia X", "Lote_Numero": "5555",
            "Lote_Bairro": "Park", "Cidade": "Birigui", "UF": "SP", "ValorAvaliacao": 350000,
            "URLlote": "lote/terreno-34/10/", "Fotos": [{"Foto": "a.jpeg"}],
            "GetLoteRealTime": [{"PracaAtual": 2, "ValorMinimoLancePrimeiraPraca": 350000, "ValorMinimoLanceSegundaPraca": 143500,
                                 "DataHoraEncerramentoPrimeiraPraca": "2026-06-30T12:15:00",
                                 "DataHoraEncerramentoSegundaPraca": "2026-07-29T12:15:00", "StatusLote": "Aberto para proposta"}]}
    carro = {"ID_Leilao": 1, "ID_Leiloes_Lote": 2, "Leilao": "Fiat Uno 2010", "Categoria": "Carros", "URLlote": "lote/x/2/",
             "GetLoteRealTime": [{}]}
    cli = cliente_para({"https://www.act.com.br/": "<html>suaplataformadeleilao</html>",
                        "https://www.act.com.br/ApiEngine/GetBusca/1/1/0": {"Lotes": [lote, carro], "PageIndexMax": 1}})
    from coletor.adaptadores import SuaPlataforma
    lotes = list(SuaPlataforma({"id": "act", "site": "https://www.act.com.br"}, cli).coletar())
    assert len(lotes) == 1  # o carro é ignorado
    n = normalizar(lotes[0], {})
    assert n.id_externo == "9-10" and n.tipo == "terreno" and n.uf == "SP" and n.cidade == "Birigui"
    assert n.lance_minimo == Decimal("143500") and n.valor_avaliacao == Decimal("350000")
    assert n.url == "https://www.act.com.br/lote/terreno-34/10/" and n.data_praca2.month == 7
