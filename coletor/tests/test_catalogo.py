from pathlib import Path

import pytest

from coletor import catalogo as cat
from coletor import normalizar as n
from coletor import registro
from coletor.adaptadores import CaixaCSV
from coletor.adaptadores.base import Adaptador
from coletor.http import Cliente

from .conftest import transporte

FIX = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("texto,esperado", [
    ("Leilão de imóveis do Banco Santander Brasil S.A.", "Santander"),
    ("Imóvel Caixa nº 1444400000001", "Caixa Econômica Federal"),
    ("Casa com caixa d'água nova", None),
    ("Comitente: EMGEA - Empresa Gestora de Ativos", "Emgea"),
    ("Itaú Unibanco S.A.", "Itaú Unibanco"),
    ("Apartamento de 3 quartos", None),
])
def test_comitente(texto, esperado):
    assert n.comitente(None, texto) == esperado


def test_comitente_informado_nao_reconhecido_fica_como_veio():
    assert n.comitente("Fundação Assefaz") == "Fundação Assefaz"


def test_caixa_todas_as_ufs_tolera_uf_com_falha():
    cli = Cliente(intervalo=0, transport=transporte({
        "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_DF.csv": "Lista_imoveis_DF.csv",
        "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_GO.csv": "Lista_imoveis_GO.csv",
    }))
    ad = CaixaCSV({"id": "caixa", "tipo": "csv_caixa", "uf": ["todas"]}, cli)
    lotes = list(ad.coletar())
    assert len(lotes) == 4
    assert len(ad.erros) == 25  # as outras 25 UFs não existem no teste: viram aviso, não derrubam a coleta
    assert all(l.comitente == "Caixa Econômica Federal" for l in lotes)


def test_padroes_nao_usam_todas_como_uf():
    ad = Adaptador({"id": "x", "tipo": "automatico", "uf": ["todas"], "comitente": "Santander"}, None)
    assert "uf" not in ad.padroes and ad.padroes["comitente"] == "Santander"


def _linha(**kw):
    base = {c: "" for c in cat.COL_LEILOEIROS}
    base.update(kw)
    return base


def test_importar_lista_oficial_valida_e_adiciona():
    linhas = [
        _linha(id="leiloeiros-de-brasilia", nome="Leiloeiros de Brasília", site="https://www.leiloeirosdebrasilia.com.br",
               status_validacao="pendente", faz_imoveis="sim"),
        _linha(id="alfa", nome="Alfa Leilões", site="https://alfaleiloes.com", status_validacao="pendente"),
    ]
    regs = [
        cat.RegistroOficial("FULANO DE TAL", "123", "leiloeirosdebrasilia.com.br"),  # casa pelo domínio
        cat.RegistroOficial("Alfa Leiloes", "77", ""),                              # casa pelo nome
        cat.RegistroOficial("MARIA DA SILVA LEILOEIRA", "501", "www.mariasilvaleiloes.com.br"),  # nova
    ]
    r = cat.importar_lista_oficial(regs, "JUCIS-DF", "DF", linhas)
    assert r.validados_existentes == 2 and r.novos == 1
    assert linhas[0]["status_validacao"] == "validado" and linhas[0]["matricula"] == "123" and linhas[0]["junta"] == "JUCIS-DF"
    assert linhas[1]["matricula"] == "77"
    nova = linhas[2]
    assert nova["nome"] == "Maria Da Silva Leiloeira" and nova["site"] == "https://www.mariasilvaleiloes.com.br"
    assert nova["faz_imoveis"] == "a_verificar" and nova["uf_atuacao"] == "DF"


def test_ler_lista_oficial_csv(tmp_path):
    arq = tmp_path / "jucis.csv"
    arq.write_text("Matrícula;Nome do Leiloeiro;Endereço eletrônico\n12;JOÃO LEILOEIRO;www.joaoleiloes.com.br\n", encoding="cp1252")
    regs = cat.ler_lista_oficial(arq)
    assert regs == [cat.RegistroOficial("JOÃO LEILOEIRO", "12", "www.joaoleiloes.com.br", "")]


def test_sites_falsos_marcam_suspeito():
    linhas = [_linha(id="x", nome="X", site="https://www.golpe-leiloes.com", status_validacao="validado")]
    assert cat.aplicar_sites_falsos(linhas, {"golpe-leiloes.com"}) == ["x"]
    assert linhas[0]["status_validacao"] == "suspeito"


def test_analisar_html_detecta_plataforma_e_imoveis():
    html = '<a href="/lotes/imovel">Imóveis</a><a href="/lotes/veiculo">Veículos</a><footer>Tecnologia SOLEON</footer>'
    v = cat.analisar_html(html)
    assert v.plataforma == "soleon" and v.faz_imoveis == "sim"
    assert cat.analisar_html("<a href='/veiculos'>Carros</a> <p>Leilão de caminhões</p>").faz_imoveis == "nao"


def test_criar_fontes_usa_modelo_da_plataforma(tmp_path):
    fontes = tmp_path / "fontes"
    (fontes / "plataformas").mkdir(parents=True)
    (fontes / "plataformas" / "soleon.yaml").write_text(
        (registro.config.pasta_fontes / "plataformas" / "soleon.yaml").read_text(encoding="utf-8"), encoding="utf-8")
    linhas = [
        _linha(id="leiloeiro-x", nome="Leiloeiro X", site="https://www.leiloeirox.com.br/", uf_atuacao="DF|GO",
               status_validacao="validado", faz_imoveis="sim", plataforma="soleon"),
        _linha(id="leiloeiro-y", nome="Leiloeiro Y", site="https://y.com.br", status_validacao="validado", faz_imoveis="sim"),
        _linha(id="so-carros", nome="Só Carros", site="https://c.com.br", status_validacao="validado", faz_imoveis="nao"),
        _linha(id="pendente", nome="P", site="https://p.com.br", status_validacao="pendente", faz_imoveis="sim"),
    ]
    criados = cat.criar_fontes(linhas, set(), fontes)
    assert criados == ["leiloeiro-x", "leiloeiro-y"]
    carregadas = registro.carregar(fontes)
    x = carregadas["leiloeiro-x"]
    assert x["tipo"] == "automatico" and x["plataforma"] == "soleon"
    assert x["inicio"] == ["https://www.leiloeirox.com.br/lotes/imovel"] and x["uf"] == ["DF", "GO"]
    assert carregadas["leiloeiro-y"]["inicio"] == ["https://y.com.br"]
    assert linhas[0]["fonte_id"] == "leiloeiro-x"


def test_cobertura():
    linhas = [
        _linha(id="a", uf_atuacao="DF", status_validacao="validado", faz_imoveis="sim", fonte_id="a"),
        _linha(id="b", uf_atuacao="DF|GO", status_validacao="pendente", faz_imoveis="sim"),
        _linha(id="c", uf_atuacao="SP", status_validacao="validado", faz_imoveis="nao"),
    ]
    c = cat.cobertura(linhas, [], {"a"})
    assert c["com_fonte"] == 1 and c["imoveis_sem_fonte"] == ["b"]
    assert c["por_uf"]["DF"] == {"leiloeiros": 2, "imoveis": 2, "com_fonte": 1}


def test_catalogo_do_projeto_e_consistente():
    """Os arquivos reais do catálogo abrem, não têm ids repetidos e as fontes citadas existem."""
    leiloeiros = cat.ler(cat.ARQ_LEILOEIROS, cat.COL_LEILOEIROS)
    comitentes = cat.ler(cat.ARQ_COMITENTES, cat.COL_COMITENTES)
    ids = [l["id"] for l in leiloeiros]
    assert len(ids) == len(set(ids))
    fontes = registro.carregar()
    for x in leiloeiros + comitentes:
        assert not x["fonte_id"] or x["fonte_id"] in fontes, x["id"]
    ids_l = set(ids)
    for c in comitentes:
        for lid in filter(None, c["leiloeiros"].split("|")):
            assert lid in ids_l, (c["id"], lid)
