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


# =====================================================================================================================
# Ampliação (outubro/2026): mais cidades de praia, campi de universidades públicas e PRIVADAS, e pontos que alimentam
# a pontuação do Airbnb. Coordenadas aproximadas (erro de algumas centenas de metros); confira e acrescente à vontade.
# =====================================================================================================================


def _pares(por_uf: dict[str, str]) -> set[tuple[str, str]]:
    return {(c, uf) for uf, nomes in por_uf.items() for c in nomes.split("|") if c}


# Municípios litorâneos (todo o estoque a poucos minutos da praia). Cidades grandes continuam por bairro, acima.
CIDADES_PRAIA |= _pares({
    "SP": "iguape|ilha comprida|cananeia",
    "RJ": "sao joao da barra|sao francisco de itabapoana|quissama|armacao de buzios|buzios|itaguai|mangaratiba|saquarema|araruama|marica|sao pedro da aldeia",
    "ES": "aracruz|presidente kennedy|itapemirim|marataizes|anchieta|piuma|guarapari|conceicao da barra",
    "BA": "camacari|madre de deus|vera cruz|itaparica|jaguaripe|nilo pecanha|una|canavieiras|belmonte|santa cruz cabralia|alcobaca|nova vicosa|caravelas|mucuri|prado|porto seguro|ilheus|itacare|urucuca|marau|camamu|cairu|esplanada|conde|jandaira|entre rios|mata de sao joao",
    "SE": "barra dos coqueiros|estancia|pirambu|japaratuba",
    "AL": "marechal deodoro|barra de sao miguel|paripueira|sao miguel dos milagres|passo de camaragibe|japaratinga|maragogi|porto de pedras|coruripe|feliz deserto|piacabucu|barra de santo antonio|jequia da praia|roteiro",
    "PE": "ipojuca|cabo de santo agostinho|tamandare|sirinhaem|rio formoso|barreiros|sao jose da coroa grande|goiana|itamaraca|ilha de itamaraca|igarassu|fernando de noronha",
    "PB": "lucena|cabedelo|conde|pitimbu|baia da traicao|mataraca",
    "RN": "ceara-mirim|extremoz|maxaranguape|rio do fogo|touros|pedra grande|caicara do norte|galinhos|guamare|macau|porto do mangue|areia branca|grossos|tibau|canguaretama|baia formosa|nisia floresta|tibau do sul|sao miguel do gostoso",
    "CE": "caucaia|sao goncalo do amarante|paracuru|paraipaba|trairi|itapipoca|amontada|itarema|acarau|cruz|jijoca de jericoacoara|camocim|barroquinha|chaval|granja|aquiraz|cascavel|beberibe|fortim|aracati|icapui",
    "PI": "parnaiba|ilha grande|luis correia|cajueiro da praia",
    "MA": "sao jose de ribamar|raposa|paco do lumiar|icatu|humberto de campos|tutoia|araioses|santo amaro do maranhao|barreirinhas|alcantara|cururupu|primeira cruz",
    "PA": "salinopolis|maracana|marapanim|curuca|soure|salvaterra|augusto correa|braganca|vigia|colares|sao joao de pirabas",
    "SC": "governador celso ramos|barra velha|balneario barra do sul|paulo lopes|jaguaruna|balneario gaivota|passo de torres|icara|balneario arroio do silva|sao francisco do sul",
    "PR": "pontal do parana|matinhos|guaratuba",
    "RS": "osorio|santa vitoria do palmar|mostardas|tavares|sao jose do norte|palmares do sul|balneario pinhal|cidreira|tramandai|imbe|xangri-la|capao da canoa|arroio do sal|terra de areia|torres|dom pedro de alcantara",
})

# Bairros de orla em cidades grandes ou médias (acrescenta aos de cima)
BAIRROS_PRAIA.setdefault(("salvador", "BA"), set()).update(
    {"ribeira", "bonfim", "monte serrat", "boa viagem", "porto da barra", "graca", "pituacu", "jardim armacao", "praia do flamengo", "itapagipe", "paripe"})
BAIRROS_PRAIA[("parnamirim", "RN")] = {"pirangi do norte", "cotovelo", "pium"}
BAIRROS_PRAIA[("paranagua", "PR")] = {"ilha do mel", "ilha dos valadares"}
BAIRROS_PRAIA[("linhares", "ES")] = {"pontal do ipiranga", "regencia", "povoacao"}
BAIRROS_PRAIA[("sao mateus", "ES")] = {"guriri", "barra nova"}
BAIRROS_PRAIA[("belem", "PA")] = {"mosqueiro", "outeiro"}
BAIRROS_PRAIA.setdefault(("itajai", "SC"), set()).update({"praia dos amores"})
BAIRROS_PRAIA.setdefault(("biguacu", "SC"), set()).update({"prainha", "jardim janaina", "praia de fora"})
BAIRROS_PRAIA.setdefault(("tijucas", "SC"), set()).update({"praia de tijucas", "praia grande", "praia da tijucas"})

# --- Universidades: grandes públicas e privadas (centro do campus principal) --------------------------------------
CAMPI += [
    # São Paulo e região
    ("USP Largo São Francisco", -23.5450, -46.6350), ("USP Leste (EACH)", -23.4838, -46.4999), ("USP Piracicaba (ESALQ)", -22.7110, -47.6310),
    ("UFABC São Bernardo", -23.6720, -46.5650), ("UFSCar Sorocaba", -23.5818, -47.5232), ("PUC-Campinas", -22.8337, -47.0467),
    ("UNESP Rio Claro", -22.3953, -47.5435), ("UNESP Presidente Prudente", -22.1180, -51.4080), ("UNESP Jaboticabal", -21.2410, -48.3040),
    ("UNESP São José do Rio Preto", -20.7940, -49.3590), ("UNESP Botucatu", -22.8960, -48.4470),
    ("FGV Paulista", -23.5703, -46.6477), ("Insper", -23.5985, -46.6761), ("FAAP", -23.5417, -46.6585), ("Anhembi Morumbi", -23.5963, -46.6857),
    ("UNIP Paraíso", -23.5746, -46.6410), ("Uninove Barra Funda", -23.5265, -46.6635), ("Uninove Vergueiro", -23.5742, -46.6397),
    ("FMU Liberdade", -23.5565, -46.6340), ("São Judas Mooca", -23.5601, -46.5996), ("Cruzeiro do Sul Liberdade", -23.5575, -46.6355),
    ("ESPM Vila Mariana", -23.5906, -46.6389), ("Unisa Santo Amaro", -23.6502, -46.7114), ("UniSantos", -23.9570, -46.3380),
    # Rio de Janeiro e Niterói
    ("UFRJ Praia Vermelha", -22.9545, -43.1655), ("UNIRIO Urca", -22.9537, -43.1740), ("FGV Botafogo", -22.9410, -43.1810),
    ("CEFET-RJ Maracanã", -22.9137, -43.2158), ("UCAM Centro", -22.9043, -43.1769), ("Ibmec Centro", -22.9096, -43.1741),
    ("Veiga de Almeida Tijuca", -22.9233, -43.2380), ("UFF Valonguinho", -22.8920, -43.1180), ("UENF Campos", -21.7560, -41.2910),
    # Minas Gerais
    ("UniBH Buritis", -19.9720, -43.9640), ("FUMEC Cruzeiro", -19.9380, -43.9280), ("UFTM Uberaba", -19.7500, -47.9380),
    ("Unimontes", -16.7240, -43.8750), ("UFSJ São João del-Rei", -21.1340, -44.2530), ("UNIFEI Itajubá", -22.4130, -45.4490),
    ("Unifal Alfenas", -21.4260, -45.9480), ("UFVJM Diamantina", -18.2490, -43.5970),
    # Centro-Oeste
    ("PUC Goiás", -16.6770, -49.2440), ("UCB Taguatinga", -15.8668, -48.0326), ("UniCEUB Asa Norte", -15.7680, -47.8940),
    ("UFGD Dourados", -22.1990, -54.9330),
    # Nordeste
    ("UFC Benfica", -3.7410, -38.5410), ("UNIFOR", -3.7690, -38.4800), ("UECE Itaperi", -3.7940, -38.5540), ("UNICAP Recife", -8.0575, -34.8890),
    ("Unifacs Salvador", -12.9810, -38.4530), ("UCSAL Pituaçu", -12.9540, -38.4090), ("UEFS Feira de Santana", -12.1960, -38.9700),
    ("UESB Vitória da Conquista", -14.8860, -40.8010), ("UESC Ilhéus", -14.7960, -39.1730), ("UFCG Campina Grande", -7.2140, -35.9080),
    ("UEPB Campina Grande", -7.2110, -35.9090), ("UERN Mossoró", -5.2030, -37.3240), ("UFERSA Mossoró", -5.2070, -37.3170),
    ("UEMA São Luís", -2.5900, -44.2960),
    # Norte
    ("UNAMA Belém", -1.4510, -48.4880), ("UFRR Boa Vista", -2.8300, -60.6990), ("UFAC Rio Branco", -9.9560, -67.8660), ("UNIR Porto Velho", -8.7680, -63.9390),
    # Sul
    ("Unisinos", -29.7950, -51.1520), ("Ulbra Canoas", -29.9210, -51.1570), ("UCS Caxias do Sul", -29.1650, -51.1720), ("UPF Passo Fundo", -28.2280, -52.3800),
    ("FURG Rio Grande", -32.0730, -52.1660), ("Unisc Santa Cruz do Sul", -29.6960, -52.4390), ("Univates Lajeado", -29.4360, -51.9660),
    ("Feevale Novo Hamburgo", -29.6730, -51.1250), ("UFCSPA Porto Alegre", -30.0300, -51.2200),
    ("UDESC Florianópolis", -27.5920, -48.5380), ("Univali Itajaí", -26.9090, -48.6860), ("Unisul Pedra Branca", -27.6540, -48.6760),
    ("FURB Blumenau", -26.9190, -49.0880), ("UNIVILLE Joinville", -26.3050, -48.8450), ("UNESC Criciúma", -28.7050, -49.4000),
    ("Unochapecó", -27.1020, -52.6050),
    ("UTFPR Curitiba", -25.4390, -49.2690), ("PUCPR Curitiba", -25.4520, -49.2530), ("Universidade Positivo", -25.4440, -49.3570),
    ("UEPG Ponta Grossa", -25.0900, -50.1000), ("Unioeste Cascavel", -24.9950, -53.4580), ("Unicesumar Maringá", -23.4410, -51.9010),
]

# Palavras do texto que indicam moradia de estudante (amplia a lista de proximidade)
TEXTO_UNIVERSITARIO = (r"\b(proxim[oa]s?\s+(?:a|ao|da|do|de)\s+(?:universidade|faculdade|campus|ufmg|usp|unb|ufrj|ufrgs|ufsc|ufpr|ufba|unicamp"
                       r"|estacio|unip|uninove|anhanguera|unopar|unicesumar|uninter|unisul|unisinos|unifor|uniceub|ucb|puc|mackenzie|fmu|insper|fgv)"
                       r"|republica estudantil|moradia estudantil|kitnet universitaria)\b")

# --- Pontos que alimentam o Airbnb (aluguel por temporada) -------------------------------------------------------------
# Hospitais de referência (turismo de saúde: pacientes e acompanhantes ficam semanas)
HOSPITAIS: list[tuple[str, float, float]] = [
    ("Albert Einstein (SP)", -23.5993, -46.7157), ("Sírio-Libanês (SP)", -23.5576, -46.6460), ("HCor (SP)", -23.5710, -46.6483),
    ("Beneficência Portuguesa (SP)", -23.5707, -46.6475), ("HC-FMUSP / InCor (SP)", -23.5560, -46.6695), ("A.C. Camargo (SP)", -23.5600, -46.6340),
    ("Santa Casa (SP)", -23.5425, -46.6510), ("São Luiz Itaim (SP)", -23.5870, -46.6790),
    ("Hospital de Amor (Barretos)", -20.5500, -48.5720), ("HC-FMRP (Ribeirão Preto)", -21.1700, -47.8570), ("HC Unicamp (Campinas)", -22.8270, -47.0690),
    ("INCA (RJ)", -22.9100, -43.1850), ("Copa D'Or (RJ)", -22.9690, -43.1890), ("Samaritano Botafogo (RJ)", -22.9490, -43.1880),
    ("Barra D'Or (RJ)", -23.0000, -43.3640), ("HUCFF UFRJ (RJ)", -22.8610, -43.2330),
    ("HC UFMG (BH)", -19.9220, -43.9280), ("Mater Dei (BH)", -19.9330, -43.9480), ("Felício Rocho (BH)", -19.9360, -43.9510),
    ("HC UFPR (Curitiba)", -25.4410, -49.2310), ("Erasto Gaertner (Curitiba)", -25.4020, -49.2420),
    ("HCPA (Porto Alegre)", -30.0390, -51.2060), ("Santa Casa (Porto Alegre)", -30.0300, -51.2250), ("Moinhos de Vento (Porto Alegre)", -30.0250, -51.2000),
    ("São Lucas PUCRS (Porto Alegre)", -30.0600, -51.1730), ("HC UFPE (Recife)", -8.0510, -34.9470), ("IMIP (Recife)", -8.0570, -34.8970),
    ("Walter Cantídio (Fortaleza)", -3.7400, -38.5380), ("Araújo Jorge (Goiânia)", -16.6720, -49.2630), ("HU UFSC (Florianópolis)", -27.6030, -48.5200),
]
# Centros de convenções e feiras (turismo de negócios)
EVENTOS: list[tuple[str, float, float]] = [
    ("Anhembi (SP)", -23.5151, -46.6411), ("Expo Center Norte (SP)", -23.5105, -46.6175), ("São Paulo Expo (SP)", -23.6249, -46.6290),
    ("Transamerica Expo (SP)", -23.6502, -46.7143), ("Riocentro (RJ)", -22.9760, -43.4130), ("Centro de Eventos do Ceará (Fortaleza)", -3.7590, -38.4880),
    ("Centro de Convenções de Pernambuco", -8.0030, -34.8550), ("Minascentro (BH)", -19.9200, -43.9400),
    ("Centro de Convenções Ulysses Guimarães (Brasília)", -15.7860, -47.8970), ("Expo Unimed (Curitiba)", -25.4780, -49.2690),
]
# Atrativos turísticos dentro de cidades grandes
ATRATIVOS: list[tuple[str, float, float]] = [
    ("Cristo Redentor (RJ)", -22.9519, -43.2105), ("Pão de Açúcar (RJ)", -22.9486, -43.1566), ("Maracanã (RJ)", -22.9121, -43.2302),
    ("Parque Ibirapuera (SP)", -23.5874, -46.6576), ("MASP / Paulista (SP)", -23.5614, -46.6559), ("Pelourinho (Salvador)", -12.9710, -38.5100),
    ("Farol da Barra (Salvador)", -13.0100, -38.5330), ("Praia de Iracema (Fortaleza)", -3.7240, -38.5190), ("Boa Viagem (Recife)", -8.1200, -34.9020),
    ("Marco Zero (Recife)", -8.0630, -34.8710), ("Ponta Negra (Natal)", -5.8700, -35.1800), ("Tambaú (João Pessoa)", -7.1150, -34.8250),
    ("Esplanada dos Ministérios (Brasília)", -15.7983, -47.8754), ("Mercado Central (BH)", -19.9230, -43.9420), ("Praça da Liberdade (BH)", -19.9330, -43.9380),
    ("Pampulha (BH)", -19.8514, -43.9722), ("Jardim Botânico (Curitiba)", -25.4415, -49.2410), ("Orla do Guaíba (Porto Alegre)", -30.0470, -51.2300),
    ("Teatro Amazonas (Manaus)", -3.1303, -60.0233), ("Ver-o-Peso (Belém)", -1.4530, -48.5020), ("Beach Park (Aquiraz)", -3.8420, -38.3930),
]
# Polos de negócios (executivos em viagem curta)
NEGOCIOS: list[tuple[str, float, float]] = [
    ("Faria Lima (SP)", -23.5780, -46.6880), ("Av. Paulista (SP)", -23.5640, -46.6540), ("Berrini (SP)", -23.6100, -46.6990), ("Itaim Bibi (SP)", -23.5850, -46.6780),
    ("Vila Olímpia (SP)", -23.5950, -46.6860), ("Centro (RJ)", -22.9140, -43.1760), ("Savassi (BH)", -19.9390, -43.9370), ("Iguatemi (Salvador)", -12.9800, -38.4540),
    ("Meireles (Fortaleza)", -3.7280, -38.5000), ("Setor Comercial Sul (Brasília)", -15.7960, -47.8890), ("Batel (Curitiba)", -25.4430, -49.2820),
    ("Setor Bueno (Goiânia)", -16.7040, -49.2650),
]
# Cidades de turismo religioso, rural ou de eventos que faltavam
CIDADES_TURISTICAS |= _pares({
    "SP": "aparecida|brotas|barretos|bananal|sao bento do sapucai",
    "CE": "juazeiro do norte|canoa quebrada",
    "GO": "trindade",
    "MG": "congonhas|santa rita do sapucai",
})
