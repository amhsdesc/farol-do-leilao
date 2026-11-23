"""Hash sem contador de visitas e caminho rápido de gravação (sem banco: cursor de mentira)."""
from coletor.modelos import Lote
from coletor.repositorio import Contadores, Repositorio, hash_lote

DESC = "IMÓVEL X. Lance mínimo: R$ 8.000,00 Nº de visitas: {n} Nº de lances: 0 USUÁRIO VALOR"


def lote(n=7124, **kw) -> Lote:
    base = dict(id_externo="10463", titulo="Casa", descricao=DESC.format(n=n), uf="SP", cidade="Piracicaba", tipo="casa",
                dados={"extraido_por": "html_sfrazao"})
    base.update(kw)
    return Lote(**base)


def test_hash_ignora_contador_de_visitas():
    assert hash_lote(lote(7124)) == hash_lote(lote(7135))


def test_hash_muda_quando_o_conteudo_muda():
    assert hash_lote(lote()) != hash_lote(lote(titulo="Casa com piscina"))
    # lances é conteúdo de verdade, continua no hash
    assert hash_lote(lote()) != hash_lote(lote(descricao=DESC.format(n=7124).replace("lances: 0", "lances: 2")))


class _Cur:
    def __init__(self, linha, log):
        self.linha, self.log = linha, log

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.log.append((" ".join(sql.split())[:60], params))

    def fetchone(self):
        return self.linha


class _Conn:
    def __init__(self, linha):
        self.linha, self.log, self.commits = linha, [], 0

    def cursor(self):
        return _Cur(self.linha, self.log)

    def commit(self):
        self.commits += 1


def _existente(l: Lote, **kw):
    r = {"id": 7, "hash_conteudo": hash_lote(l), "status": "ativo", "imovel_id": 3, "lance_minimo": None,
         "data_praca1": None, "data_praca2": None, "dados": dict(l.dados)}
    r.update(kw)
    return r


def test_lote_igual_nao_reescreve_nada_e_so_marca_visto():
    l = lote()
    conn = _Conn(_existente(lote(7000)))  # só o contador de visitas é diferente
    repo, c = Repositorio(conn), Contadores()
    assert repo.gravar("sfrazao", l, 1, c) == "igual"
    assert c.iguais == 1 and c.lidos == 1 and c.alterados == 0 and 7 in c.vistos
    sqls = [s for s, _ in conn.log]
    assert len(sqls) == 1 and sqls[0].startswith("select"), sqls  # nenhuma escrita por lote
    repo.descarregar_vistos()
    assert conn.log[-1][0].startswith("update lote set ultimo_visto_em") and conn.log[-1][1] == ([7],)


def test_vistos_sao_gravados_em_lote_a_cada_200():
    conn = _Conn(_existente(lote()))
    repo, c = Repositorio(conn), Contadores()
    for _ in range(200):
        repo.gravar("sfrazao", lote(), 1, c)
    updates = [p for s, p in conn.log if s.startswith("update lote set ultimo_visto_em")]
    assert len(updates) == 1 and len(updates[0][0]) == 200 and conn.commits == 1


def test_lote_removido_ou_alterado_nao_usa_o_caminho_rapido():
    l = lote()
    for existente in (_existente(l, status="removido"), _existente(l, hash_conteudo="outro"),
                      _existente(l, dados={"extraido_por": "outro"}), _existente(l, imovel_id=None)):
        conn = _Conn(existente)
        repo, c = Repositorio(conn), Contadores()
        try:
            repo.gravar("sfrazao", l, 1, c)
        except Exception:
            pass  # o cursor de mentira não sabe responder ao resto: o que importa é que saiu do caminho rápido
        assert not repo._vistos_pendentes and len(conn.log) > 1
