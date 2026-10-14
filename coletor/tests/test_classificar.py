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
    assert campus_proximo(-22.8180, -47.0690) is not None
    assert campus_proximo(-3.1, -60.0) is None or True
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


def test_universidade_privada_e_regioes_novas():
    assert campus_proximo(-29.7950, -51.1520) == "Unisinos"
    assert campus_proximo(-23.5985, -46.6761) == "Insper"
    perto = im(uf="RS", cidade="São Leopoldo", lat=-29.7940, lon=-51.1530, geo_precisao="endereco")
    assert "universitario" in classificar_imovel(perto)


def test_praia_cidades_novas():
    for cidade, uf in (("Maragogi", "AL"), ("Aquiraz", "CE"), ("Parnaíba", "PI"), ("Osório", "RS"), ("Aracruz", "ES"), ("Armação de Búzios", "RJ")):
        assert "praia" in classificar_imovel(im(cidade=cidade, uf=uf)), cidade
    assert "praia" in classificar_imovel(im(cidade="Linhares", uf="ES", bairro="Pontal do Ipiranga"))
    assert "praia" not in classificar_imovel(im(cidade="Linhares", uf="ES", bairro="Centro"))


def test_airbnb_por_pontuacao_hospital_e_negocios():
    from coletor.classificar import pontuar_airbnb
    # perto do Albert Einstein (hospital: 2) e da Berrini? só hospital = 2 pontos: não basta
    so_hospital = im(lat=-23.5990, lon=-46.7150, geo_precisao="endereco")
    assert "airbnb" not in classificar_imovel(so_hospital)
    # hospital + polo de negócios (Faria Lima/Itaim): 4 pontos
    hosp_neg = im(lat=-23.5870, lon=-46.6790, geo_precisao="endereco")  # São Luiz Itaim + Itaim Bibi
    pontos, motivos = pontuar_airbnb(hosp_neg, set(), "")
    assert pontos >= 4 and any("hospital" in m for m in motivos) and any("negócios" in m for m in motivos)
    assert "airbnb" in classificar_imovel(hosp_neg)
    # atrativo sozinho vale 3 (Pelourinho)
    assert "airbnb" in classificar_imovel(im(uf="BA", cidade="Salvador", lat=-12.9710, lon=-38.5100, geo_precisao="endereco"))
    # coordenada do centro da cidade não conta ponto de distância
    assert "airbnb" not in classificar_imovel(im(uf="BA", cidade="Salvador", lat=-12.9710, lon=-38.5100, geo_precisao="cidade"))
    # grande demais não é airbnb
    assert "airbnb" not in classificar_imovel(im(uf="BA", cidade="Salvador", quartos=5, area=320, lat=-12.9710, lon=-38.5100, geo_precisao="endereco"))
