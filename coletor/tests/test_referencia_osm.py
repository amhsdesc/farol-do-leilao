from coletor.referencia_osm import filtrar


def test_filtrar_universidades_do_osm():
    el = [
        {"type": "way", "center": {"lat": -23.5614, "lon": -46.7344}, "tags": {"name": "Universidade de São Paulo"}},
        {"type": "way", "center": {"lat": -23.56141, "lon": -46.73441}, "tags": {"name": "Universidade de São Paulo"}},  # repetida no mesmo lugar
        {"type": "node", "lat": -22.9, "lon": -43.2, "tags": {"name": "Estácio Centro"}},
        {"type": "node", "lat": 40.0, "lon": -3.7, "tags": {"name": "Universidad fora do Brasil"}},
        {"type": "node", "lat": -10.0, "lon": -50.0, "tags": {}},
    ]
    r = filtrar(el)
    assert [x[0] for x in r] == ["Estácio Centro", "Universidade de São Paulo"]
