"""Listas de referência das tags de investimento (Praia, Turístico, Universitário). Tudo em texto simples, sem IA.

Para ampliar a cobertura, é só acrescentar nomes/pontos aqui: nomes sem acento e em minúsculas (usamos `simplificar`),
no formato ("cidade", "UF"). As coordenadas dos campi são aproximadas (centro do campus principal).
"""
from __future__ import annotations

# --- Praia -----------------------------------------------------------------------------------------------------
# Cidades em que praticamente todo o estoque residencial está a poucos minutos da praia.
CIDADES_PRAIA: set[tuple[str, str]] = {(c, uf) for uf, nomes in {
    "SP": "praia grande|guaruja|itanhaem|peruibe|mongagua|ubatuba|caraguatatuba|ilhabela|bertioga|sao sebastiao|ilha comprida|cananeia",
    "RJ": "cabo frio|arraial do cabo|armacao dos buzios|rio das ostras|angra dos reis|paraty|saquarema|marica|araruama|iguaba grande|casimiro de abreu|sao pedro da aldeia|mangaratiba",
    "SC": "florianopolis|balneario camboriu|itapema|bombinhas|porto belo|penha|balneario picarras|navegantes|itapoa|sao francisco do sul|garopaba|imbituba|laguna",
    "PR": "guaratuba|matinhos|pontal do parana",
    "RS": "capao da canoa|xangri-la|tramandai|imbe|cidreira|torres|arroio do sal|terra de areia|balneario pinhal",
    "ES": "guarapari|marataizes|piuma|anchieta|itapemirim|conceicao da barra",
    "BA": "porto seguro|ilheus|itacare|mata de sao joao|prado|caravelas|mucuri|cairu|camamu",
    "SE": "barra dos coqueiros",
    "AL": "maragogi|japaratinga|sao miguel dos milagres|paripueira|barra de sao miguel|porto de pedras",
    "PE": "ipojuca|tamandare|sao jose da coroa grande|cabo de santo agostinho",
    "PB": "cabedelo|conde|pitimbu|baia da traicao",
    "RN": "tibau do sul|nisia floresta|extremoz|touros|sao miguel do gostoso|maxaranguape",
    "CE": "aquiraz|cascavel|beberibe|fortim|aracati|icapui|trairi|paracuru|paraipaba|jijoca de jericoacoara|cruz|camocim|itapipoca",
    "PI": "luis correia|cajueiro da praia",
    "MA": "barreirinhas|raposa|paco do lumiar",
    "PA": "salinopolis|marapanim|maracana",
}.items() for c in nomes.split("|")}

# Cidades grandes: só os bairros de frente para o mar (ou a poucas quadras da orla).
BAIRROS_PRAIA: dict[tuple[str, str], set[str]] = {
    ("rio de janeiro", "RJ"): set("copacabana|ipanema|leblon|leme|barra da tijuca|recreio dos bandeirantes|sao conrado|arpoador|flamengo|botafogo|urca|joatinga|vidigal|grumari|prainha|barra de guaratiba|praia da bandeira|jardim guanabara".split("|")),
    ("niteroi", "RJ"): set("icarai|sao francisco|charitas|piratininga|itacoatiara|camboinhas|jurujuba|boa viagem".split("|")),
    ("salvador", "BA"): set("barra|ondina|rio vermelho|pituba|itapua|stella maris|armacao|patamares|jaguaribe|piata|boca do rio|costa azul|amaralina|vitoria|corsario".split("|")),
    ("lauro de freitas", "BA"): set("vilas do atlantico|ipitanga|buraquinho|vilas do atlantico".split("|")),
    ("fortaleza", "CE"): set("meireles|mucuripe|praia de iracema|praia do futuro|vicente pinzon|titanzinho|sabiaguaba|cais do porto|varjota".split("|")),
    ("caucaia", "CE"): set("cumbuco|icarai|tabuba|pacheco".split("|")),
    ("recife", "PE"): set("boa viagem|pina|brasilia teimosa".split("|")),
    ("jaboatao dos guararapes", "PE"): set("piedade|candeias".split("|")),
    ("paulista", "PE"): set("janga|pau amarelo|maria farinha".split("|")),
    ("olinda", "PE"): set("casa caiada|bairro novo|rio doce|jardim atlantico".split("|")),
    ("natal", "RN"): set("ponta negra|areia preta|praia do meio|via costeira|mae luiza|santos reis".split("|")),
    ("joao pessoa", "PB"): set("tambau|cabo branco|manaira|bessa|jardim oceania|aeroclube|altiplano cabo branco".split("|")),
    ("maceio", "AL"): set("ponta verde|pajucara|jatiuca|cruz das almas|jacarecica|ponta da terra|pitanguinha|ponta grossa|sao jorge|guaxuma".split("|")),
    ("aracaju", "SE"): set("atalaia|aruana|coroa do meio|jardins|farolandia".split("|")),
    ("vitoria", "ES"): set("praia do canto|praia do sua|jardim camburi|jardim da penha|enseada do sua|santa lucia".split("|")),
    ("vila velha", "ES"): set("praia da costa|itapua|itaparica|praia de itaparica|coqueiral de itaparica|ilha dos ayres|praia de itapua|barra do jucu".split("|")),
    ("serra", "ES"): set("jacaraipe|manguinhos|praia de carapebus|carapebus".split("|")),
    ("sao luis", "MA"): set("calhau|ponta d'areia|ponta dareia|olho d'agua|olho dagua|sao marcos|litoranea|aracagy|araçagi|ponta do farol".split("|")),
    ("santos", "SP"): set("gonzaga|boqueirao|embare|aparecida|ponta da praia|jose menino|campo grande".split("|")),
    ("sao vicente", "SP"): set("itarare|gonzaguinha|ilha porchat|boa vista|vila valenca".split("|")),
    ("cubatao", "SP"): set(),
    ("itajai", "SC"): set("praia brava|cabecudas|fazenda".split("|")),
    ("palhoca", "SC"): set("pinheira|guarda do embau".split("|")),
    ("sao jose", "SC"): set("barreiros".split("|")),
    ("rio grande", "RS"): set("cassino".split("|")),
    ("macae", "RJ"): set("cavaleiros|imbetiba|praia campista|riviera fluminense".split("|")),
}

# Palavras fortes no texto (título/descrição/endereço). "praia" sozinha só vale no título, bairro e endereço.
TEXTO_PRAIA_FORTE = r"\b(frente (?:para )?(?:o )?mar|pe na areia|beira[- ]?mar|vista (?:para o |do )?mar|quadra do mar|orla maritima)\b"
TEXTO_PRAIA_LOCAL = r"\b(praia|praias|beira mar|litoral)\b"

# --- Turístico -------------------------------------------------------------------------------------------------
CIDADES_TURISTICAS: set[tuple[str, str]] = {(c, uf) for uf, nomes in {
    "RS": "gramado|canela|bento goncalves|garibaldi|nova petropolis|sao francisco de paula|cambara do sul|farroupilha|carlos barbosa",
    "SC": "urubici|bombinhas|balneario camboriu|florianopolis|sao joaquim|treze tilias|pomerode",
    "PR": "foz do iguacu|morretes|antonina|guaratuba|prudentopolis",
    "SP": "campos do jordao|holambra|olimpia|socorro|serra negra|aguas de lindoia|lindoia|amparo|atibaia|ilhabela|ubatuba|paraty|sao luiz do paraitinga|monte alegre do sul|aguas de sao pedro",
    "RJ": "paraty|armacao dos buzios|angra dos reis|petropolis|nova friburgo|teresopolis|itatiaia|vassouras|arraial do cabo|cabo frio|penedo|mangaratiba|rio das ostras|visconde de maua",
    "MG": "ouro preto|tiradentes|sao joao del rei|diamantina|mariana|pocos de caldas|sao lourenco|caxambu|capitolio|carrancas|sao thome das letras|camanducaia|monte verde|sao roque de minas|lavras novas|conceicao do mato dentro|serro|ibitipoca|lima duarte|sao tome das letras",
    "MS": "bonito|jardim",
    "MT": "chapada dos guimaraes|nobres",
    "GO": "pirenopolis|alto paraiso de goias|caldas novas|rio quente|goias|cavalcante|corumba de goias|cidade de goias",
    "TO": "jalapao|mateiros|taquarucu|lagoa da confusao|ponte alta do tocantins",
    "BA": "lencois|mucuge|palmeiras|rio de contas|porto seguro|itacare|cairu|mata de sao joao|trancoso|arraial dajuda|caravelas|prado|ilheus|vera cruz|morro de sao paulo",
    "AL": "maragogi|sao miguel dos milagres|penedo|japaratinga|piranhas",
    "PE": "ipojuca|tamandare|fernando de noronha|olinda|gravata|bezerros|bonito|garanhuns",
    "PB": "cabedelo|conde|areia",
    "RN": "tibau do sul|sao miguel do gostoso",
    "CE": "jijoca de jericoacoara|aracati|beberibe|ubajara|guaramiranga|cascavel|trairi|camocim",
    "PI": "luis correia|piracuruca|sao raimundo nonato|barra grande",
    "MA": "barreirinhas|santo amaro do maranhao|carolina|alcantara",
    "PA": "salinopolis|soure|alter do chao",
    "AM": "presidente figueiredo|novo airao|parintins",
    "ES": "guarapari|domingos martins|pedra azul|marechal floriano|conceicao da barra|santa teresa|piuma",
}.items() for c in nomes.split("|")}
TEXTO_TURISTICO = r"\b(ponto turistico|pousada|resort|hotel|hospedagem|temporada|turismo|atracao turistica|polo turistico|chale)\b"

# --- Universitário ---------------------------------------------------------------------------------------------
RAIO_CAMPUS_KM = 2.5
CAMPI: list[tuple[str, float, float]] = [
    ("USP Butantã", -23.5614, -46.7344), ("PUC-SP Perdizes", -23.5380, -46.6700), ("Mackenzie", -23.5470, -46.6520),
    ("UFABC Santo André", -23.6460, -46.5280), ("UNIFESP Vila Clementino", -23.5980, -46.6430),
    ("UNICAMP", -22.8176, -47.0693), ("UFSCar São Carlos", -21.9830, -47.8810), ("USP São Carlos", -22.0070, -47.8960),
    ("USP Ribeirão Preto", -21.1700, -47.8590), ("UNESP Bauru", -22.3490, -49.0290), ("UNESP Araraquara", -21.8060, -48.1930),
    ("UFRJ Fundão", -22.8600, -43.2300), ("UERJ Maracanã", -22.9110, -43.2360), ("PUC-Rio Gávea", -22.9790, -43.2330),
    ("UFF Gragoatá", -22.8970, -43.1330), ("UFRRJ Seropédica", -22.7640, -43.6850),
    ("UFMG Pampulha", -19.8685, -43.9650), ("PUC Minas Coração Eucarístico", -19.9250, -43.9950), ("UFU Santa Mônica", -18.9170, -48.2590),
    ("UFJF", -21.7770, -43.3680), ("UFLA Lavras", -21.2280, -44.9770), ("UFV Viçosa", -20.7600, -42.8680), ("UFOP Ouro Preto", -20.3960, -43.5070),
    ("UFES Goiabeiras", -20.2770, -40.3040),
    ("UnB Darcy Ribeiro", -15.7633, -47.8700), ("UFG Samambaia", -16.6030, -49.2640), ("UFG Setor Universitário", -16.6800, -49.2420),
    ("UFMT Cuiabá", -15.6094, -56.0670), ("UFMS Campo Grande", -20.5010, -54.6130),
    ("UFRGS Centro", -30.0346, -51.2177), ("UFRGS Vale", -30.0700, -51.1200), ("PUCRS", -30.0580, -51.1740), ("UFSM Santa Maria", -29.7210, -53.7170),
    ("UFPel", -31.7960, -52.4090), ("UFSC Trindade", -27.6000, -48.5180), ("UFPR Politécnico", -25.4510, -49.2310), ("UFPR Reitoria", -25.4290, -49.2670),
    ("UEL Londrina", -23.3230, -51.2000), ("UEM Maringá", -23.4060, -51.9400),
    ("UFBA Ondina", -13.0010, -38.5080), ("UFPE Cidade Universitária", -8.0500, -34.9500), ("UFRPE Dois Irmãos", -8.0170, -34.9490),
    ("UFC Pici", -3.7440, -38.5750), ("UFRN Natal", -5.8420, -35.1990), ("UFPB João Pessoa", -7.1390, -34.8450), ("UFAL Maceió", -9.5560, -35.7750),
    ("UFS São Cristóvão", -10.9270, -37.1000), ("UFMA São Luís", -2.5580, -44.3090), ("UFPI Teresina", -5.0570, -42.7920),
    ("UFPA Guamá", -1.4750, -48.4570), ("UFAM Manaus", -3.0910, -59.9700), ("UFT Palmas", -10.1800, -48.3600),
]

# Palavras no texto. Só vale "próximo à universidade/faculdade/campus", moradia estudantil/república e bairro "Universitário"
# (a palavra solta apareceria em qualquer endereço, "Rua da Faculdade" etc.).
TEXTO_UNIVERSITARIO = r"\b(proxim[oa]s?\s+(?:a|ao|da|do|de)\s+(?:universidade|faculdade|campus|ufmg|usp|unb|ufrj|ufrgs|ufsc|ufpr|ufba|unicamp)|republica estudantil|moradia estudantil)\b"
BAIRRO_UNIVERSITARIO = r"\buniversitari[oa]\b"
