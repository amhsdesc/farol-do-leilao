"""Geocodificação em duas passadas: cidade para todos primeiro, endereço/bairro depois."""
import httpx

from coletor.geocodificar import Geocodificador, consultas


class FakeCur:
    def __init__(self, banco):
        self.b, self.res = banco, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=()):
        s = " ".join(sql.split())
        if s.startswith("select lat, lon, resposta from geocache"):
            r = self.b.cache.get(params[0])
            self.res = [r] if r else []
        elif s.startswith("insert into geocache"):
            self.b.cache.setdefault(params[0], {"lat": params[1], "lon": params[2], "resposta": {}})
        elif "where i.geom is null" in s:
            self.res = [im for im in self.b.imoveis.values() if im["geom"] is None]
        elif "i.geo_precisao = 'cidade'" in s:
            self.res = [im for im in self.b.imoveis.values() if im["precisao"] == "cidade" and (im["endereco"] or im["bairro"])]
        elif s.startswith("update imovel set geom"):
            lon, lat, precisao, id_ = params
            self.b.imoveis[id_].update(geom=(lat, lon), precisao=precisao)

    def fetchall(self):
        return self.res

    def fetchone(self):
        return self.res[0] if self.res else None


class FakeConn:
    def __init__(self, imoveis):
        self.imoveis = {i["id"]: {**i, "geom": None, "precisao": None} for i in imoveis}
        self.cache = {}

    def cursor(self):
        return FakeCur(self)

    def commit(self):
        pass


def _transporte(so_cidade: bool):
    pedidos = []

    def h(req: httpx.Request):
        q = req.url.params["q"]
        pedidos.append(q)
        if so_cidade and q.count(",") > 2:  # endereço/bairro: o Nominatim não acha
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[{"lat": "-30.1", "lon": "-51.2", "type": "city"}])

    return httpx.MockTransport(h), pedidos


def test_consultas_terminam_na_cidade():
    c = consultas({"cidade": "Mato Leitão", "uf": "RS", "bairro": "Centro", "endereco": "Rua A, 10"})
    assert [p for _, p in c] == ["endereco", "bairro", "cidade"]


def test_primeira_passada_poe_todos_no_mapa_pela_cidade():
    conn = FakeConn([
        {"id": 1, "endereco": "Rua A, 10", "bairro": "Centro", "cidade": "Mato Leitão", "uf": "RS"},
        {"id": 2, "endereco": "Rua B, 20", "bairro": None, "cidade": "Mato Leitão", "uf": "RS"},
    ])
    t, pedidos = _transporte(so_cidade=True)
    r = Geocodificador(conn, transport=t, intervalo=0).executar()
    assert all(i["geom"] is not None for i in conn.imoveis.values())
    assert r["cidade"] == 2 and r["refinados"] == 0
    # a cidade foi consultada uma vez só (a segunda veio do cache)
    assert sum(1 for q in pedidos if q == "Mato Leitão, RS, Brasil") == 1


def test_segunda_passada_refina_e_nao_repete_o_que_ja_falhou():
    conn = FakeConn([{"id": 1, "endereco": "Rua A, 10", "bairro": "Centro", "cidade": "Mato Leitão", "uf": "RS"}])
    t, pedidos = _transporte(so_cidade=True)
    g = Geocodificador(conn, transport=t, intervalo=0)
    g.executar()
    n = len(pedidos)
    g.executar()  # nada novo: as consultas de endereço/bairro que falharam estão no cache
    assert len(pedidos) == n
    assert conn.imoveis[1]["precisao"] == "cidade"


def test_refina_quando_o_endereco_e_achado():
    conn = FakeConn([{"id": 1, "endereco": "Rua A, 10", "bairro": None, "cidade": "Mato Leitão", "uf": "RS"}])
    conn.imoveis[1].update(geom=(-30.0, -51.0), precisao="cidade")
    t, _ = _transporte(so_cidade=False)
    r = Geocodificador(conn, transport=t, intervalo=0).executar()
    assert r["refinados"] == 1 and conn.imoveis[1]["precisao"] == "endereco"


def test_respeita_o_tempo_maximo():
    conn = FakeConn([{"id": i, "endereco": None, "bairro": None, "cidade": f"C{i}", "uf": "RS"} for i in range(1, 6)])
    t, pedidos = _transporte(so_cidade=False)
    Geocodificador(conn, transport=t, intervalo=0).executar(max_segundos=-1)
    assert pedidos == []
