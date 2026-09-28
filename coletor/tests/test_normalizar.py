from datetime import datetime
from decimal import Decimal

import pytest

from coletor import normalizar as n
from coletor.modelos import LoteBruto


@pytest.mark.parametrize("entrada,esperado", [
    ("R$ 1.234.567,89", Decimal("1234567.89")),
    ("689.000,00", Decimal("689000.00")),
    ("450.000", Decimal("450000")),
    ("49.54", Decimal("49.54")),
    ("45,12 m²", Decimal("45.12")),
    (1234.5, Decimal("1234.5")),
    ("1,234,567.89", Decimal("1234567.89")),
    ("sem valor", None),
    (None, None),
])
def test_numero(entrada, esperado):
    assert n.numero(entrada) == esperado


def test_data_hora_formatos():
    assert n.data_hora("10/11/2026 às 14h00") == datetime(2026, 11, 10, 14, 0, tzinfo=n.FUSO)
    assert n.data_hora("24/11/2026 14:30") == datetime(2026, 11, 24, 14, 30, tzinfo=n.FUSO)
    assert n.data_hora("2026-11-05T15:00:00").hour == 15
    assert n.data_hora("5 de novembro de 2026").month == 11
    assert n.data_hora("em breve") is None


@pytest.mark.parametrize("texto,tipo", [
    ("Apartamento, 49.54 de área", "apartamento"),
    ("Casa térrea", "casa"),
    ("Chácara em Planaltina", "rural"),
    ("Terreno urbano", "terreno"),
    ("Sala comercial", "comercial"),
    ("Veículo", "outros"),
])
def test_tipo(texto, tipo):
    assert n.tipo(texto) == tipo


@pytest.mark.parametrize("texto,mod", [
    ("2º Leilão SFI", "extrajudicial"),
    ("Venda Direta Online", "venda_direta"),
    ("Licitação Aberta", "licitacao"),
    ("Leilão Judicial - 5ª Vara", "judicial"),
    ("Leilão Extrajudicial (Lei 9.514/97)", "extrajudicial"),
])
def test_modalidade(texto, mod):
    assert n.modalidade(texto) == mod


def test_ocupacao_so_afirma_o_que_a_fonte_diz():
    assert n.ocupacao("Imóvel ocupado") == "ocupado"
    assert n.ocupacao("Imóvel desocupado") == "desocupado"
    assert n.ocupacao("Apartamento de 3 quartos") == "nao_informado"


def test_uf():
    assert n.uf("df") == "DF"
    assert n.uf("Goiás") == "GO"
    assert n.uf("Águas Claras / DF") == "DF"
    assert n.uf("XX") is None


def test_endereco_normalizado():
    assert n.endereco_normalizado("SQN 408 Bl. X Apto 101") == "sqn 408 bloco x apartamento 101"
    assert n.endereco_normalizado("R. 25 Norte, nº 5") == "rua 25 norte 5"


def test_extrair_da_descricao_caixa():
    d = n.extrair_da_descricao("Apartamento, 105.20 de área total, 98.00 de área privativa, 0.00 de área do terreno, 3 qto(s), 1 vaga(s) de garagem.")
    assert d["area_privativa"] == Decimal("98.00")
    assert d["area_total"] == Decimal("105.20")
    assert "area_terreno" not in d
    assert d["quartos"] == 3 and d["vagas"] == 1


def test_praca_vigente_pelas_datas():
    agora = datetime(2026, 10, 1, tzinfo=n.FUSO)
    b = LoteBruto(id_externo="1", data_praca1="01/09/2026 10h", valor_praca1="R$ 1.150.000,00",
                  data_praca2="29/10/2026 10h", valor_praca2="R$ 689.000,00")
    lote = n.normalizar(b, agora=agora)
    assert lote.praca_atual == 2
    assert lote.lance_minimo == Decimal("689000.00")


def test_coordenada_fora_do_brasil_descartada():
    lote = n.normalizar(LoteBruto(id_externo="1", lat=48.85, lon=2.35))
    assert lote.lat is None and lote.lon is None
