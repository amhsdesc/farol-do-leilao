"""Transforma o texto cru das fontes em valores padronizados.

Todas as funções aceitam None e devolvem None quando não há como interpretar:
melhor um campo vazio do que um valor inventado.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from .modelos import Lote, LoteBruto

FUSO = ZoneInfo("America/Sao_Paulo")

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
    "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}
NOMES_UF = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE",
    "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA",
    "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR",
    "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO",
}


# ---------------------------------------------------------------- texto

def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def simplificar(texto: Any) -> str:
    """minúsculas, sem acento, espaços únicos."""
    if texto is None:
        return ""
    t = sem_acento(str(texto)).lower()
    return re.sub(r"\s+", " ", t).strip()


def limpar(texto: Any) -> str | None:
    if texto is None:
        return None
    t = re.sub(r"\s+", " ", str(texto)).strip()
    return t or None


# ---------------------------------------------------------------- números

def numero(valor: Any) -> Decimal | None:
    """Aceita 'R$ 1.234.567,89', '1234567.89', 1234.5, '45,12 m²'. Devolve Decimal."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float, Decimal)):
        try:
            return Decimal(str(valor))
        except InvalidOperation:
            return None
    t = str(valor)
    m = re.search(r"-?\d[\d.,]*", t.replace("\xa0", " "))
    if not m:
        return None
    s = m.group(0).rstrip(".,")
    negativo = s.startswith("-")
    s = s.lstrip("-")
    if "," in s and "." in s:
        # o separador que aparece por último é o decimal
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # padrão brasileiro: uma vírgula = decimal; várias = milhar
        s = s.replace(",", ".") if s.count(",") == 1 else s.replace(",", "")
    elif "." in s:
        # várias = milhar ('1.234.567'); uma seguida de 3 dígitos = milhar ('450.000'); senão decimal ('49.54')
        if s.count(".") > 1 or len(s.split(".")[-1]) == 3:
            s = s.replace(".", "")
    if negativo:
        s = "-" + s
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def dinheiro(valor: Any) -> Decimal | None:
    n = numero(valor)
    if n is None or n <= 0:
        return None
    return n.quantize(Decimal("0.01"))


def inteiro(valor: Any) -> int | None:
    n = numero(valor)
    return int(n) if n is not None else None


def area(valor: Any) -> Decimal | None:
    n = numero(valor)
    if n is None or n <= 0:
        return None
    return n.quantize(Decimal("0.01"))


# ---------------------------------------------------------------- datas

_MESES = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}


def data_hora(valor: Any) -> datetime | None:
    """Aceita '12/10/2026 14:00', '12/10/2026 às 14h30', '2026-10-12T14:00:00', '12 de outubro de 2026'."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=FUSO)
    t = simplificar(valor)
    try:
        d = datetime.fromisoformat(str(valor).strip().replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=FUSO)
    except ValueError:
        pass
    m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", t)
    if m:
        dia, mes, ano = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.search(r"(\d{1,2}) de ([a-z]{3})[a-z]* de (\d{4})", t)
        if not m or m.group(2) not in _MESES:
            return None
        dia, mes, ano = int(m.group(1)), _MESES[m.group(2)], int(m.group(3))
    if ano < 100:
        ano += 2000
    hora = minuto = 0
    h = re.search(r"(\d{1,2})\s*(?:h|:)\s*(\d{2})?", t[m.end():])
    if h:
        hora, minuto = int(h.group(1)), int(h.group(2) or 0)
    try:
        return datetime(ano, mes, dia, hora, minuto, tzinfo=FUSO)
    except ValueError:
        return None


# ---------------------------------------------------------------- categorias

def booleano(valor: Any) -> bool | None:
    if valor is None or valor == "":
        return None
    if isinstance(valor, bool):
        return valor
    t = simplificar(valor)
    if t in {"sim", "s", "true", "1", "yes", "aceita"} or t.startswith("sim"):
        return True
    if t in {"nao", "n", "false", "0", "no"} or t.startswith("nao"):
        return False
    return None


_TIPOS = [
    ("apartamento", ["apartamento", "apto", "flat", "cobertura", "kitnet", "kitinete", "studio", "loft"]),
    ("casa", ["casa", "sobrado", "residencia"]),
    ("rural", ["rural", "fazenda", "sitio", "chacara", "gleba"]),
    ("terreno", ["terreno", "lote urbano", "area urbana"]),
    ("galpao", ["galpao", "armazem", "industrial", "deposito"]),
    ("comercial", ["comercial", "sala", "loja", "predio", "edificio", "escritorio", "hotel", "posto"]),
    ("vaga", ["vaga de garagem", "box de garagem"]),
]


def tipo(valor: Any, *textos_extra: Any) -> str:
    for texto in (valor, *textos_extra):
        t = simplificar(texto)
        if not t:
            continue
        for nome, palavras in _TIPOS:
            if any(re.search(rf"\b{p}", t) for p in palavras):
                return nome
    return "outros"


def modalidade(valor: Any, *textos_extra: Any) -> str:
    for texto in (valor, *textos_extra):
        t = simplificar(texto)
        if not t:
            continue
        if "venda direta" in t or "venda online" in t or "compra direta" in t:
            return "venda_direta"
        if "licitacao" in t:
            return "licitacao"
        if "judicial" in t and "extra" not in t:
            return "judicial"
        if "extrajudicial" in t or "extra judicial" in t or "sfi" in t or "9.514" in t or "alienacao fiduciaria" in t:
            return "extrajudicial"
        if "hasta" in t or "processo" in t or "vara" in t:
            return "judicial"
    return "outros"


def status(valor: Any) -> str:
    t = simplificar(valor)
    if not t:
        return "ativo"
    if "suspens" in t:
        return "suspenso"
    if "arrematad" in t or "vendid" in t:
        return "arrematado"
    if "desert" in t:
        return "deserto"
    if "encerrad" in t or "finalizad" in t or "cancelad" in t or "retirad" in t:
        return "encerrado"
    return "ativo"


def ocupacao(valor: Any, *textos_extra: Any) -> str:
    """Só afirma o que a fonte afirma. Sem menção = nao_informado."""
    for texto in (valor, *textos_extra):
        t = simplificar(texto)
        if not t:
            continue
        if re.search(r"\bdesocupad|\blivre de ocupa|\bimovel vago\b|\bvazio\b", t):
            return "desocupado"
        if re.search(r"\bocupad", t):
            return "ocupado"
    return "nao_informado"


_DIVIDAS = r"(?:debitos?|dividas?|iptu|condominio|taxas? condominia|tributos?|encargos?)"
_VENDEDOR = r"(?:vendedor|comitente|credor(?: fiduciario)?|banco|caixa|alienante|proprietario|exequente)"
_COMPRADOR = r"(?:arrematante|comprador|adquirente|licitante vencedor)"


def debitos_por_conta(valor: Any, *textos_extra: Any) -> str:
    """Quem paga IPTU/condomínio atrasados. Só afirma o que a fonte afirma.

    Se qualquer trecho põe alguma dívida com o arrematante, devolve 'arrematante' (o mais cauteloso),
    mesmo que outro trecho ponha outra dívida com o vendedor.
    """
    direto = simplificar(valor)
    if direto in {"vendedor", "comitente"}:
        return "vendedor"
    if direto in {"arrematante", "comprador"}:
        return "arrematante"
    achou_vendedor = False
    for texto in (valor, *textos_extra):
        t = simplificar(texto)
        if not t:
            continue
        perto = r"[^.;]{0,120}?"
        dono = r"(?:por conta|a cargo|de responsabilidade|sob responsabilidade|responsabilidade|pagos?|quitad[oa]s?|arcad[oa]s?) (?:do|da|pelo|pela)"
        if re.search(rf"{_DIVIDAS}{perto}{dono} {_COMPRADOR}", t) or re.search(rf"{_COMPRADOR}{perto}(?:arcara|pagara|assume|assumira|responde){perto}{_DIVIDAS}", t):
            return "arrematante"
        if (
            re.search(rf"{_DIVIDAS}{perto}{dono} {_VENDEDOR}", t)
            or re.search(rf"{_VENDEDOR}{perto}(?:arcara|pagara|quitara|assume|assumira){perto}{_DIVIDAS}", t)
            or re.search(r"livre e desembaracad[oa] de (?:quaisquer )?(?:onus|debitos|dividas)", t)
            or re.search(r"sub-?rogam?(?:-se)? no (?:respectivo )?preco", t)  # CTN art. 130: saem do valor do lance
        ):
            achou_vendedor = True
    return "vendedor" if achou_vendedor else "nao_informado"


def aceita_parcelamento(valor: Any, *textos_extra: Any) -> bool | None:
    """True/False só quando a fonte diz; None quando não fala nada."""
    b = booleano(valor)
    if b is not None:
        return b
    for texto in textos_extra:
        t = simplificar(texto)
        if not t:
            continue
        if re.search(r"nao (?:aceita|admite|sera aceito|sera admitido|ha possibilidade de) (?:o )?(?:pagamento )?parcela|somente a vista|apenas a vista|exclusivamente a vista", t):
            return False
        if re.search(r"(?:aceita|admite|permite|possibilidade de)[^.;]{0,40}parcela|pagamento parcelado|proposta(?:s)? de parcelamento|em ate \d+ (?:parcelas|vezes|prestacoes)|art(?:igo)?\.? 895", t):
            return True
    return None


def uf(valor: Any) -> str | None:
    if valor is None:
        return None
    t = str(valor).strip().upper()
    if t in UFS:
        return t
    s = simplificar(valor)
    if s in NOMES_UF:
        return NOMES_UF[s]
    m = re.search(r"(?:[-/,]\s*|\b)([A-Z]{2})\s*$", str(valor).strip())
    if m and m.group(1) in UFS:
        return m.group(1)
    return None


# ---------------------------------------------------------------- comitente (quem vende)

# nome padronizado → padrões de reconhecimento (texto simplificado, sem acento)
COMITENTES: dict[str, list[str]] = {
    "Caixa Econômica Federal": [r"\bcaixa economica\b", r"\bcef\b", r"\bimovel caixa\b", r"\bcaixa\b(?! (?:postal|d.?agua|de agua|de gordura|de inspecao))"],
    "Banco do Brasil": [r"\bbanco do brasil\b", r"\bbb s\.?a\b"],
    "Santander": [r"\bsantander\b"],
    "Bradesco": [r"\bbradesco\b"],
    "Itaú Unibanco": [r"\bitau\b"],
    "BRB": [r"\bbrb\b", r"\bbanco de brasilia\b"],
    "Banrisul": [r"\bbanrisul\b"],
    "Banestes": [r"\bbanestes\b"],
    "Banpará": [r"\bbanpara\b"],
    "Emgea": [r"\bemgea\b"],
    "Sicoob": [r"\bsicoob\b"],
    "Sicredi": [r"\bsicredi\b"],
    "Banco Inter": [r"\bbanco inter\b"],
    "BTG Pactual": [r"\bbtg\b"],
    "Banco BV": [r"\bbanco bv\b", r"\bbv financeira\b", r"\bbanco votorantim\b"],
    "Safra": [r"\bsafra\b"],
    "Porto Seguro": [r"\bporto seguro\b", r"\bporto bank\b"],
    "Banco do Nordeste": [r"\bbanco do nordeste\b", r"\bbnb\b"],
    "Banco da Amazônia": [r"\bbanco da amazonia\b", r"\bbasa\b"],
    "BNDES": [r"\bbndes\b"],
    "União (SPU)": [r"\bsecretaria do patrimonio da uniao\b", r"\bspu\b", r"\bimoveis da uniao\b"],
    "Embracon": [r"\bembracon\b"],
    "Rodobens": [r"\brodobens\b"],
    "Banco Pan": [r"\bbanco pan\b"],
    "Daycoval": [r"\bdaycoval\b"],
    "Mercantil do Brasil": [r"\bmercantil do brasil\b"],
    "C6 Bank": [r"\bc6 bank\b"],
}


def comitente(valor: Any, *textos_extra: Any) -> str | None:
    """Padroniza quem vende. Primeiro o campo informado, depois título/descrição."""
    for texto in (valor, *textos_extra):
        t = simplificar(texto)
        if not t:
            continue
        for nome, padroes in COMITENTES.items():
            if any(re.search(p, t) for p in padroes):
                return nome
        if texto is valor:  # comitente informado e não reconhecido: mantém como veio
            return limpar(valor)
    return None


# ---------------------------------------------------------------- endereço

_ABREVIACOES = {
    r"\br\b": "rua", r"\bav\b": "avenida", r"\bavda\b": "avenida", r"\btv\b": "travessa",
    r"\bal\b": "alameda", r"\bpca\b": "praca", r"\brod\b": "rodovia", r"\best\b": "estrada",
    r"\bqd\b": "quadra", r"\bq\b": "quadra", r"\bqda\b": "quadra", r"\bconj\b": "conjunto",
    r"\bcj\b": "conjunto", r"\bbl\b": "bloco", r"\blt\b": "lote", r"\bapto?\b": "apartamento",
    r"\bap\b": "apartamento", r"\bn[o°º]?\b": "", r"\bnumero\b": "", r"\bs/?n\b": "sn",
    r"\bcs\b": "casa", r"\bed\b": "edificio", r"\bedif\b": "edificio",
}


def endereco_normalizado(endereco: Any) -> str | None:
    t = simplificar(endereco)
    if not t:
        return None
    t = re.sub(r"cep:?\s*\d{5}-?\d{3}", " ", t)
    t = re.sub(r"[^\w\s]", " ", t)
    for padrao, subst in _ABREVIACOES.items():
        t = re.sub(padrao, subst, t)
    return re.sub(r"\s+", " ", t).strip() or None


# ---------------------------------------------------------------- descrição

def extrair_da_descricao(texto: str | None) -> dict[str, Any]:
    """Tira áreas, quartos e vagas de descrições livres (padrão Caixa e similares)."""
    if not texto:
        return {}
    t = simplificar(texto)
    out: dict[str, Any] = {}
    padroes = {
        "area_privativa": r"([\d.,]+)\s*(?:m2|m²)?\s*de area privativa|area privativa:?\s*([\d.,]+)",
        "area_total": r"([\d.,]+)\s*(?:m2|m²)?\s*de area total|area total:?\s*([\d.,]+)",
        "area_terreno": r"([\d.,]+)\s*(?:m2|m²)?\s*de area do terreno|area do terreno:?\s*([\d.,]+)",
        "quartos": r"(\d+)\s*(?:qto\(s\)|quartos?|dormitorios?|dorms?)",
        "vagas": r"(\d+)\s*vagas?",
    }
    for campo, padrao in padroes.items():
        m = re.search(padrao, t)
        if m:
            bruto = next(g for g in m.groups() if g)
            valor = inteiro(bruto) if campo in {"quartos", "vagas"} else area(bruto)
            if valor:
                out[campo] = valor
    return out


# ---------------------------------------------------------------- lote

def normalizar(bruto: LoteBruto, padroes: dict[str, Any] | None = None, agora: datetime | None = None) -> Lote:
    """Converte LoteBruto em Lote. `padroes` preenche campos que a fonte não informa (ex.: uf)."""
    padroes = padroes or {}
    agora = agora or datetime.now(FUSO)
    textos = (bruto.titulo, bruto.descricao)
    extra = extrair_da_descricao(" ".join(filter(None, textos)))

    def campo(nome: str) -> Any:
        v = getattr(bruto, nome)
        return v if v not in (None, "", []) else padroes.get(nome)

    d1, d2 = data_hora(campo("data_praca1")), data_hora(campo("data_praca2"))
    v1, v2 = dinheiro(campo("valor_praca1")), dinheiro(campo("valor_praca2"))
    lance = dinheiro(campo("lance_minimo"))
    praca = inteiro(campo("praca_atual"))

    # praça vigente pelas datas, quando a fonte não diz
    if praca is None and (d1 or d2):
        if d1 and d1 >= agora:
            praca = 1
        elif d2:
            praca = 2
    if lance is None:
        lance = v2 if praca == 2 and v2 else v1 or v2

    lat, lon = bruto.lat, bruto.lon
    if lat is not None and lon is not None:
        try:
            lat, lon = float(lat), float(lon)
            if not (-35 < lat < 6 and -75 < lon < -30):  # fora do Brasil
                lat = lon = None
        except (TypeError, ValueError):
            lat = lon = None

    endereco = limpar(campo("endereco"))
    return Lote(
        id_externo=str(bruto.id_externo).strip(),
        url=limpar(bruto.url),
        titulo=limpar(bruto.titulo),
        descricao=limpar(bruto.descricao),
        tipo=tipo(campo("tipo"), *textos),
        modalidade=modalidade(campo("modalidade"), *textos),
        status=status(campo("status")),
        uf=uf(campo("uf")),
        cidade=limpar(campo("cidade")),
        bairro=limpar(campo("bairro")),
        endereco=endereco,
        endereco_normalizado=endereco_normalizado(endereco),
        lat=lat,
        lon=lon,
        area_privativa=area(campo("area_privativa")) or extra.get("area_privativa"),
        area_total=area(campo("area_total")) or extra.get("area_total"),
        area_terreno=area(campo("area_terreno")) or extra.get("area_terreno"),
        quartos=inteiro(campo("quartos")) or extra.get("quartos"),
        vagas=inteiro(campo("vagas")) or extra.get("vagas"),
        matricula=limpar(campo("matricula")),
        cartorio=limpar(campo("cartorio")),
        valor_avaliacao=dinheiro(campo("valor_avaliacao")),
        lance_minimo=lance,
        praca_atual=praca,
        data_praca1=d1,
        valor_praca1=v1,
        data_praca2=d2,
        valor_praca2=v2,
        ocupacao=ocupacao(campo("ocupacao"), *textos),
        aceita_financiamento=booleano(campo("aceita_financiamento")),
        aceita_fgts=booleano(campo("aceita_fgts")),
        aceita_parcelamento=aceita_parcelamento(campo("aceita_parcelamento"), *textos),
        debitos_por_conta=debitos_por_conta(campo("debitos_por_conta"), *textos),
        leiloeiro=limpar(campo("leiloeiro")),
        comitente=comitente(campo("comitente"), *textos),
        processo=limpar(campo("processo")),
        edital_url=limpar(campo("edital_url")),
        fotos=[f for f in (bruto.fotos or []) if f][:30],
        dados=bruto.dados or {},
    )
