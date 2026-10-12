"""Página de detalhe da Caixa: leitor por regra fixa e integração com o adaptador csv_caixa (sem IA, sem banco real)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import httpx

from coletor.adaptadores import CaixaCSV
from coletor.adaptadores.caixa_csv import URL_DETALHE
from coletor.adaptadores.caixa_detalhe import ler_detalhe
from coletor.http import Cliente
from coletor.normalizar import normalizar

FIX = Path(__file__).parent / "fixtures"
CSV_DF = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_DF.csv"
DETALHE = (FIX / "caixa_detalhe_sfi.html").read_text(encoding="utf-8")
IDS_DF = ["1444400000001", "1444400000002", "1444400000003"]  # os três lotes de Lista_imoveis_DF.csv


def _pagina(corpo: str) -> str:
    return f"<html><body>{corpo}</body></html>"


# ---------------------------------------------------------------- leitor


def test_ler_detalhe_pagina_real():
    d = ler_detalhe(DETALHE)
    assert d["aceita_fgts"] is True
    assert "aceita_financiamento" not in d and "aceita_parcelamento" not in d  # a página não fala: fica "não informado"
    assert d["debitos_por_conta"] == "arrematante"
    assert d["condominio"].startswith("Sob responsabilidade do comprador")
    assert d["leiloeiro"] == "Andressa Sedrez Terres Tonial Ferreira"
    assert d["data_praca1"] == "05/10/2026 10:00" and d["data_praca2"] == "09/10/2026 10:00"
    assert d["valor_praca1"] == "250.000,00" and d["valor_praca2"] == "168.312,91"
    assert d["matricula"] == "69679" and d["cartorio"] == "2º Ofício de JOAO PESSOA-PB"
    assert d["edital_numero"] == "0046/0226 - CPA/RE"
    assert "ocupacao" not in d  # a página não diz se está ocupado


def test_ler_detalhe_nao_inventa_o_que_a_pagina_nao_diz():
    assert ler_detalhe(_pagina("<p>Imóvel sem nada reconhecível</p>")) == {}
    # lista de pagamento sem FGTS: ausência não é negação
    d = ler_detalhe(_pagina("<p>FORMAS DE PAGAMENTO ACEITAS:</p><p>Recursos próprios.</p>"))
    assert "aceita_fgts" not in d and d["formas_pagamento"] == ["Recursos próprios"]


def test_ler_detalhe_negacao_explicita_e_vendedor():
    # Texto sintético (não é captura da Caixa): serve para travar o comportamento das negações e do vendedor.
    d = ler_detalhe(_pagina(
        "<p>FORMAS DE PAGAMENTO ACEITAS:</p>"
        "<p>Não permite financiamento. Permite utilização de FGTS.</p>"
        "<p>REGRAS PARA PAGAMENTO DAS DESPESAS (caso existam):</p>"
        "<p>Condomínio: Sob responsabilidade da CAIXA.</p><p>Tributos: Sob responsabilidade da CAIXA.</p>"
    ))
    assert d["aceita_financiamento"] is False  # a negação do financiamento não vaza para o FGTS
    assert d["aceita_fgts"] is True
    assert d["debitos_por_conta"] == "vendedor"
    # basta uma despesa com o comprador para o aviso ser o cauteloso
    d = ler_detalhe(_pagina(
        "<p>REGRAS PARA PAGAMENTO DAS DESPESAS (caso existam):</p>"
        "<p>Condomínio: Sob responsabilidade da CAIXA, até 10% do valor de avaliação.</p>"
        "<p>Tributos: Sob responsabilidade do comprador.</p>"
    ))
    assert d["debitos_por_conta"] == "arrematante"


def test_ler_detalhe_ocupacao_so_na_descricao():
    d = ler_detalhe(_pagina("<p>Descrição:</p><p>Casa, 3 quartos, imóvel desocupado.</p><p>FORMAS DE PAGAMENTO ACEITAS:</p>"))
    assert d["ocupacao"] == "desocupado"


# ---------------------------------------------------------------- adaptador


class Banco:
    """Banco de mentira: devolve as linhas que o adaptador pediria (id_externo + o que já foi lido)."""

    def __init__(self, linhas):
        self.linhas = linhas
        self.confirmado = 0

    def cursor(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, *a, **k):
        pass

    def fetchall(self):
        return self.linhas

    def commit(self):
        self.confirmado += 1


def _cliente(respostas: dict[str, str | int], pedidos: list[str]) -> Cliente:
    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if url.endswith("/robots.txt"):
            return httpx.Response(404)
        if url == CSV_DF:
            return httpx.Response(200, content=(FIX / "Lista_imoveis_DF.csv").read_bytes())
        pedidos.append(url)
        r = respostas.get(url)
        if isinstance(r, int):
            return httpx.Response(r)
        if r is None:
            return httpx.Response(404)
        return httpx.Response(200, content=r.encode("utf-8"), headers={"content-type": "text/html; charset=utf-8"})
    return Cliente(intervalo=0, transport=httpx.MockTransport(handler))


def _fonte(**extra):
    return {"id": "caixa-df", "tipo": "csv_caixa", "uf": ["DF"], **extra}


def _detalhe_de(id_):
    return URL_DETALHE.format(id=id_)


def test_adaptador_aplica_o_detalhe_e_sobrevive_a_falha():
    pedidos: list[str] = []
    cli = _cliente({_detalhe_de(IDS_DF[0]): DETALHE}, pedidos)  # os outros dois: 404
    ad = CaixaCSV(_fonte(detalhe=True), cli)
    lotes = {l.id_externo: l for l in ad.coletar()}
    assert set(lotes) == set(IDS_DF)

    a = normalizar(lotes[IDS_DF[0]])
    assert a.aceita_fgts is True and a.debitos_por_conta == "arrematante"
    assert a.leiloeiro == "Andressa Sedrez Terres Tonial Ferreira" and a.comitente == "Caixa Econômica Federal"
    assert a.matricula == "69679" and a.cartorio == "2º Ofício de JOAO PESSOA-PB"
    assert a.valor_praca2 == Decimal("168312.91") and a.data_praca1 == datetime(2026, 10, 5, 10, 0, tzinfo=a.data_praca1.tzinfo)
    assert a.lance_minimo == Decimal("689000.00")  # o que veio da lista não é trocado
    assert a.dados["caixa_detalhe"]["campos"]["edital_numero"] == "0046/0226 - CPA/RE"

    b = normalizar(lotes[IDS_DF[1]])  # detalhe 404: continua "não informado", sem derrubar a coleta
    assert b.aceita_fgts is None and b.debitos_por_conta == "nao_informado" and b.leiloeiro == "Caixa Econômica Federal"
    assert "falhou_em" in b.dados["caixa_detalhe"]
    assert any("1 lidos, 2 falhas" in av for av in ad.avisos) and ad.erros == []  # falha de detalhe não é erro da fonte


def test_adaptador_respeita_teto_e_prioriza_lotes_novos():
    pedidos: list[str] = []
    cli = _cliente({_detalhe_de(i): DETALHE for i in IDS_DF}, pedidos)
    ad = CaixaCSV(_fonte(detalhe=True, detalhe_max_por_rodada=2), cli)
    lotes = list(ad.coletar())
    assert len(pedidos) == 2
    assert sum(1 for l in lotes if "caixa_detalhe" in l.dados) == 2
    assert any("2 lidos, 0 falhas, 1 ainda na fila" in av for av in ad.avisos)


def test_adaptador_repassa_o_que_ja_foi_lido_sem_buscar_de_novo():
    """O CSV não traz FGTS; sem repassar o cache, a próxima gravação apagaria o que foi lido do detalhe."""
    pedidos: list[str] = []
    cli = _cliente({}, pedidos)
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    campos = ler_detalhe(DETALHE)
    # a chave da lista = "lance_minimo|modalidade" como vêm no CSV, para o cache valer
    chave = "689.000,00|2º Leilão SFI"
    banco = Banco([{"id_externo": IDS_DF[0], "d": {"lido_em": agora, "chave_lista": chave, "campos": campos}}])
    ad = CaixaCSV(_fonte(), cli, conn=banco)  # com banco, o detalhe liga sozinho
    lotes = {l.id_externo: l for l in ad.coletar()}
    assert normalizar(lotes[IDS_DF[0]]).aceita_fgts is True
    assert _detalhe_de(IDS_DF[0]) not in pedidos  # já lido, preço igual: não busca de novo
    assert _detalhe_de(IDS_DF[1]) in pedidos  # nunca lido: busca
    assert banco.confirmado >= 1  # a leitura do cache não deixa transação aberta


def test_adaptador_rele_quando_o_preco_muda_ou_a_leitura_vence():
    pedidos: list[str] = []
    cli = _cliente({_detalhe_de(i): DETALHE for i in IDS_DF}, pedidos)
    agora = datetime.now(timezone.utc)
    velho = (agora - timedelta(days=45)).isoformat(timespec="seconds")
    recente = agora.isoformat(timespec="seconds")
    campos = ler_detalhe(DETALHE)
    banco = Banco([
        {"id_externo": IDS_DF[0], "d": {"lido_em": recente, "chave_lista": "preço antigo|2º Leilão SFI", "campos": campos}},
        {"id_externo": IDS_DF[1], "d": {"lido_em": velho, "chave_lista": "275.000,00|Venda Direta Online", "campos": campos}},
        {"id_externo": IDS_DF[2], "d": {"falhou_em": recente, "motivo": "HTTP 500"}},
    ])
    list(CaixaCSV(_fonte(), cli, conn=banco).coletar())
    assert sorted(pedidos) == sorted([_detalhe_de(IDS_DF[0]), _detalhe_de(IDS_DF[1])])  # o terceiro falhou há pouco: espera


def test_adaptador_para_quando_o_site_nao_responde():
    pedidos: list[str] = []
    cli = _cliente({}, pedidos)  # tudo 404
    # 12 lotes iguais com ids diferentes não existem na fixture; basta conferir que 3 falhas não interrompem nada
    ad = CaixaCSV(_fonte(detalhe=True), cli)
    assert len(list(ad.coletar())) == 3
    assert ad.erros == []


def test_detalhe_pode_ser_desligado():
    pedidos: list[str] = []
    ad = CaixaCSV(_fonte(detalhe=False), _cliente({}, pedidos), conn=Banco([]))
    assert len(list(ad.coletar())) == 3 and pedidos == []
