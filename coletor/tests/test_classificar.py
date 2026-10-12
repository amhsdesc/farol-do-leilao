from coletor.classificar import campus_proximo, classificar_imovel


def im(**kw):
    base = {"tipo": "apartamento", "uf": "SP", "cidade": "São Paulo", "bairro": None, "endereco": None,
            "quartos": 2, "area": 70, "lat": None, "lon": None, "geo_precisao": None}
    base.update(kw)
    return base


def test_praia_por_cidade_e_bairro():
    assert "praia" in classificar_imovel(im(cidade="Praia Grande"))
    assert "praia" in classificar_imovel(im(uf="RJ", cidade="Rio de Janeiro", bairro="Copacabana"))
    assert "praia" not in classificar_imovel(im(uf="RJ", cidade="Rio de Janeiro", bairro="Madureira"))
    assert "praia" not in classificar_imovel(im(cidade="Campinas"))


def test_praia_por_texto_e_negacao():
    assert "praia" in classificar_imovel(im(cidade="Campinas"), "Apartamento frente mar com 2 quartos")
    assert "praia" not in classificar_imovel(im(cidade="Campinas"), "imóvel longe da praia, sem acesso ao mar; frente mar nao")


def test_universitario_por_distancia_so_com_coordenada_precisa():
    assert campus_proximo(-22.8180, -47.0690) == "UNICAMP"
    perto = im(uf="SP", cidade="Campinas", lat=-22.8180, lon=-47.0690, geo_precisao="endereco")
    assert "universitario" in classificar_imovel(perto)
    assert "universitario" not in classificar_imovel({**perto, "geo_precisao": "cidade"})
    assert "universitario" not in classificar_imovel({**perto, "tipo": "terreno"})


def test_universitario_por_texto():
    assert "universitario" in classificar_imovel(im(), "Apartamento próximo à universidade")
    assert "universitario" not in classificar_imovel(im(), "Rua da Faculdade, 10")


def test_airbnb_exige_praia_ou_turistico_e_imovel_compacto():
    assert "airbnb" in classificar_imovel(im(cidade="Balneário Camboriú", uf="SC", quartos=2))
    assert "airbnb" not in classificar_imovel(im(cidade="Balneário Camboriú", uf="SC", quartos=5, area=300))
    assert "airbnb" not in classificar_imovel(im(cidade="Gramado", uf="RS", tipo="terreno"))
    assert "airbnb" not in classificar_imovel(im(cidade="Campinas"))
    t = classificar_imovel(im(cidade="Gramado", uf="RS"))
    assert "turistico" in t and "airbnb" in t


def test_nao_classifica_veiculo_rural_nem_garagem():
    assert classificar_imovel(im(tipo="rural", cidade="Gramado", uf="RS")) == []
    assert classificar_imovel(im(tipo="vaga", cidade="Santos")) == []
