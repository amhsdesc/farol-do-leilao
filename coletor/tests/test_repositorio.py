"""Testes com banco real (PostgreSQL + PostGIS). Rodar com TEST_DATABASE_URL definido."""
from pathlib import Path

from coletor.coleta import executar

from .test_adaptadores import CAIXA, FONTE_SELETORES, mapa_leiloeiro

FIX = Path(__file__).parent / "fixtures"
FONTE_CAIXA = {"id": "caixa", "nome": "Caixa", "tipo": "csv_caixa", "uf": ["DF", "GO"]}


def _csv_df(linhas_remover=(), trocar=None) -> bytes:
    texto = (FIX / "Lista_imoveis_DF.csv").read_bytes().decode("cp1252")
    linhas = [l for l in texto.split("\r\n") if not any(l.startswith(r) for r in linhas_remover)]
    texto = "\r\n".join(linhas)
    if trocar:
        texto = texto.replace(*trocar)
    return texto.encode("cp1252")


def _um(conn, sql, *args):
    with conn.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchone()


def test_historico_dedup_e_remocao(conn, cliente_para):
    go = "Lista_imoveis_GO.csv"

    # 1ª coleta: tudo novo
    r = executar(FONTE_CAIXA, conn, cliente_para({CAIXA.format("DF"): "Lista_imoveis_DF.csv", CAIXA.format("GO"): go}))
    assert r.status == "ok" and r.contadores.novos == 4
    assert _um(conn, "select count(*) n from leitura")["n"] == 4

    # 2ª coleta idêntica: nada muda, nenhuma leitura nova
    r = executar(FONTE_CAIXA, conn, cliente_para({CAIXA.format("DF"): "Lista_imoveis_DF.csv", CAIXA.format("GO"): go}))
    assert r.contadores.novos == 0 and r.contadores.alterados == 0 and r.contadores.iguais == 4
    assert _um(conn, "select count(*) n from leitura")["n"] == 4

    # leiloeiro revende o imóvel Caixa 1444400000001: mesma ficha de imóvel
    r = executar(FONTE_SELETORES, conn, cliente_para(mapa_leiloeiro()))
    assert r.status == "ok" and r.contadores.novos == 2
    par = _um(conn, """select count(distinct imovel_id) n from lote
                       where (fonte_id, id_externo) in (('caixa','1444400000001'), ('leiloeiro-teste','102'))""")
    assert par["n"] == 1
    busca = _um(conn, """select v.n_fontes, v.lance_minimo from vw_busca v join lote l on l.imovel_id = v.imovel_id
                         where l.id_externo = '102'""")
    assert busca["n_fontes"] == 2

    # preço cai num lote e outro some da lista: 1 alterado, 1 removido, histórico preservado
    df = _csv_df(linhas_remover=("1444400000003",), trocar=("275.000,00", "250.000,00"))
    r = executar(FONTE_CAIXA, conn, cliente_para({CAIXA.format("DF"): df, CAIXA.format("GO"): go}))
    assert r.status == "ok" and r.contadores.alterados == 1 and r.contadores.removidos == 1
    hist = _um(conn, """select array_agg(le.lance_minimo order by le.lida_em) precos from leitura le
                        join lote l on l.id = le.lote_id where l.id_externo = '1444400000002'""")
    assert [float(x) for x in hist["precos"]] == [275000.0, 250000.0]
    assert _um(conn, "select status from lote where id_externo = '1444400000003'")["status"] == "removido"

    # o lote volta: evento 'reaparecido'
    r = executar(FONTE_CAIXA, conn, cliente_para({CAIXA.format("DF"): "Lista_imoveis_DF.csv", CAIXA.format("GO"): go}))
    ev = _um(conn, """select evento from leitura le join lote l on l.id = le.lote_id
                      where l.id_externo = '1444400000003' order by le.id desc limit 1""")
    assert ev["evento"] == "reaparecido"


def test_coletor_quebrado_nao_apaga_nada(conn, cliente_para):
    go = "Lista_imoveis_GO.csv"
    executar(FONTE_CAIXA, conn, cliente_para({CAIXA.format("DF"): "Lista_imoveis_DF.csv", CAIXA.format("GO"): go}))
    # layout mudou e só 1 de 4 lotes foi lido
    df = _csv_df(linhas_remover=("1444400000001", "1444400000002", "1444400000003"))
    r = executar({**FONTE_CAIXA, "uf": ["DF", "GO"]}, conn, cliente_para({CAIXA.format("DF"): df, CAIXA.format("GO"): go}))
    assert r.status == "parcial" and r.contadores.removidos == 0
    assert _um(conn, "select count(*) n from lote where status = 'ativo'")["n"] == 4

    # site fora do ar: execução com erro, nada removido
    r = executar(FONTE_CAIXA, conn, cliente_para({}))
    assert r.status == "erro"
    assert _um(conn, "select count(*) n from lote where status = 'ativo'")["n"] == 4
