"""O filtro "Leiloeiro" do site precisa de valor: fonte de leiloeiro preenche pelo nome da fonte."""
from coletor.adaptadores.base import Adaptador
from coletor.modelos import LoteBruto
from coletor.normalizar import normalizar


def _ad(fonte):
    return Adaptador(fonte, None)


def test_fonte_de_leiloeiro_usa_o_nome_como_leiloeiro():
    ad = _ad({"id": "mega-leiloes", "nome": "Mega Leilões"})
    assert ad.padroes["leiloeiro"] == "Mega Leilões"
    l = normalizar(LoteBruto(id_externo="1"), ad.padroes)
    assert l.leiloeiro == "Mega Leilões"


def test_fonte_de_banco_nao_vira_leiloeiro():
    ad = _ad({"id": "caixa-rj", "nome": "Caixa Econômica Federal (RJ)", "comitente": "Caixa Econômica Federal"})
    assert "leiloeiro" not in ad.padroes


def test_leiloeiro_informado_pela_pagina_tem_prioridade():
    ad = _ad({"id": "x", "nome": "Portal X"})
    l = normalizar(LoteBruto(id_externo="1", leiloeiro="Fulano de Tal"), ad.padroes)
    assert l.leiloeiro == "Fulano de Tal"


def test_comitente_que_e_titulo_de_leilao_e_ignorado():
    from coletor.normalizar import comitente
    for titulo in ("SOLD", "VENDA DE 36 CASAS GERMINADAS EM ESTEIO/RS", "LEILÕES DE IMÓVEIS",
                   "LEILÃO DEZEMBRO 2026", "IMÓVEIS NO PARANÁ, RIO GRD DO SUL E STA CATARINA", "COMPRE JÁ OU FAÇA SUA PROPOSTA"):
        assert comitente(titulo) is None, titulo
    assert comitente("LEILÃO DE IMÓVEIS DA CELESC S.A.") == "CELESC S.A."
    assert comitente("Casas Bahia SA") == "Casas Bahia SA"
    assert comitente("BANCO SANTANDER S.A.") == "Santander"
    # título sem vendedor: o texto do lote ainda pode revelar o banco
    assert comitente("LEILÃO DEZEMBRO 2026", "Imóvel do Banco Bradesco S.A.") == "Bradesco"


def test_comitente_leilao_federal_e_receita_e_nunca_fica_vazio():
    from coletor.normalizar import comitente, comitente_padrao
    assert comitente("LEILÃO FEDERAL - SÃO PAULO") == "Receita Federal"
    assert comitente("Receita Federal do Brasil") == "Receita Federal"
    assert comitente(None, "débitos com a Receita Federal por conta do arrematante") is None
    assert comitente_padrao("judicial") == "Leilão judicial"
    assert comitente_padrao("extrajudicial") == "Não informado"
