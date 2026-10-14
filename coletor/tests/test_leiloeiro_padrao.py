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
