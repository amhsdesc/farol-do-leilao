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


def test_tribunal_escrito_de_jeitos_diferentes_vira_um_so_e_nome_em_maiusculas_e_capitalizado():
    from coletor.normalizar import comitente
    esperado = "Tribunal de Justiça de São Paulo"
    for v in ("Tribunal de Justiça do Estado de São Paulo", "Tribunal De Justiça Do Estado De São Paulo", "TRIBUNAL DE JUSTICA DO ESTADO DE SAO PAULO"):
        assert comitente(v) == esperado, v
    assert comitente("TRIBUNAL DE JUSTICA DO PARANA") == "Tribunal de Justiça do Paraná"
    assert comitente("MASSA FALIDA DE CONSTRUTORA XYZ LTDA") == "Massa Falida de Construtora Xyz LTDA"
    assert comitente("Casas Bahia SA") == "Casas Bahia SA"


def test_comitente_final_reduz_nao_informado():
    from coletor.normalizar import comitente_final
    # judicial: número CNJ identifica o tribunal (8.26 = TJSP, 8.16 = TJPR, 5.10 = TRT-10, 4.01 = TRF-1)
    assert comitente_final(None, ("Casa", "Processo 1001234-55.2021.8.26.0100"), "judicial", "RJ") == "Tribunal de Justiça de São Paulo"
    assert comitente_final(None, ("Apto 0001234-55.2021.8.16.0001",), "judicial", None) == "Tribunal de Justiça do Paraná"
    assert comitente_final(None, ("Casa 0001234-55.2021.5.10.0001",), "judicial", "DF").startswith("Justiça do Trabalho")
    assert comitente_final(None, ("Casa 0001234-55.2021.4.01.3400",), "judicial", "DF").startswith("Justiça Federal")
    # sem número: pelo texto e, por último, pela UF
    assert comitente_final(None, ("Vara do Trabalho de Goiânia",), "judicial", "GO") == "Justiça do Trabalho"
    assert comitente_final(None, ("Casa",), "judicial", "BA") == "Tribunal de Justiça da Bahia"
    assert comitente_final(None, ("Casa",), "judicial", None) == "Leilão judicial"
    # extrajudicial: vendedor citado no texto (só entidade, nunca pessoa)
    assert comitente_final(None, ("Credor fiduciário: Banco Pan S.A. - CNPJ 1",), "extrajudicial", "SP") == "Banco Pan"
    assert comitente_final(None, ("Vendedor: João da Silva",), "extrajudicial", "SP") == "Não informado"
    assert comitente_final(None, ("Casa",), "extrajudicial", "SP") == "Não informado"
