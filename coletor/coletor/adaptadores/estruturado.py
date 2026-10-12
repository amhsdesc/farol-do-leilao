"""Leitura sem IA de páginas de lote que trazem os dados prontos em JSON dentro do HTML.

A família de sites "Leilão PRO / suporteleiloes" (leilaobrasil, peterlongo, trileiloes, luizlobato...)
entrega cada página de lote já com `var lote = {...}` embutido. Lemos esse JSON em vez de pagar a IA.

`ler()` devolve:
  - dict de campos  → lote de imóvel lido com segurança (monte com Adaptador.montar);
  - NAO_IMOVEL      → a página é de outra coisa (veículo, máquina...): pule, sem IA;
  - None            → não deu para ter certeza (sem JSON, sem cidade/UF, status estranho): siga o caminho normal.
Na dúvida devolve None: errar para o lado da IA custa centavos; errar para o outro lado publica dado ruim.
"""
from __future__ import annotations

import json
import re
from typing import Any

from bs4 import BeautifulSoup

from ..normalizar import simplificar, uf as normalizar_uf

NAO_IMOVEL = object()

_NAO_IMOVEL = re.compile(r"\b(veiculo|carro|moto|caminhao|onibus|automovel|maquina|sucata|equipamento|movel|moveis|semovente|joia|eletronic)")
_IMOVEL = re.compile(r"\b(imov|imoveis|terreno|apart|casa|comercial|rural|galpao|sala|loja|conjunto|fazenda|chacara|sitio|lote|gleba|cobertura|edificio|predio|hotel|barrac)")
_CIDADE_UF = re.compile(r"(?:^|[-–,]\s*)([A-ZÀ-Ú][\wÀ-ú'. ]{1,40}?)\s*[-/]\s*([A-Z]{2})\s*$")


# Página de evento (lista de lotes): /eventos/leilao/<id>/<slug>, sem o trecho /lote.
_EVENTO = re.compile(r"/(?:eventos/)?leilao/\d+(?:/[^/?#]+)?/?(?:[?#].*)?$")


# Páginas de navegação que nunca são um lote (lista de lotes, planilha, sala online, login...).
_NAVEGACAO = re.compile(r"/(?:evento/(?:detalhes|redirect[^/]*)/[^/?#]+|lotes/lista|planilha|online|auditorio[^/?#]*|arrematante/[^/?#]+|login|cadastro)/?(?:[?#].*)?$", re.I)


def pagina_de_evento(url: str) -> bool:
    return bool(_EVENTO.search(url)) or pagina_de_lista(url) or bool(_NAVEGACAO.search(url or ""))


def extrair_var_lote(html: str) -> dict | None:
    """Acha `var lote = {...}` e devolve o dict (varredura por chaves balanceadas, respeitando strings)."""
    i = html.find("var lote =")
    if i < 0:
        return None
    j = html.find("{", i)
    if j < 0:
        return None
    prof, dentro, esc = 0, False, False
    for k in range(j, len(html)):
        c = html[k]
        if dentro:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                dentro = False
        elif c == '"':
            dentro = True
        elif c == "{":
            prof += 1
        elif c == "}":
            prof -= 1
            if prof == 0:
                try:
                    obj = json.loads(html[j : k + 1])
                except ValueError:
                    return None
                return obj if isinstance(obj, dict) else None
    return None


def _txt(html_ou_texto: Any) -> str:
    if not html_ou_texto:
        return ""
    return re.sub(r"\s+", " ", BeautifulSoup(str(html_ou_texto), "lxml").get_text(" ", strip=True)).strip()


def _data(d: Any) -> str | None:
    """{'date': '2026-11-03 10:02:00.000000', ...} → '2026-11-03T10:02'."""
    s = d.get("date") if isinstance(d, dict) else d
    m = re.match(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})", str(s or ""))
    return f"{m.group(1)}T{m.group(2)}" if m else None


def _valor(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def _local(bem: dict, titulo: str, texto: str) -> tuple[str | None, str | None, str | None]:
    """cidade, uf, bairro: do JSON; se faltar, de 'Cidade - UF' no título ou numa linha do texto."""
    cidade, uf, bairro = (bem.get("cidade") or None), normalizar_uf(bem.get("uf")), (bem.get("bairro") or None)
    if cidade and uf:
        return cidade.strip(), uf, bairro
    candidatos = [titulo] + [l.strip() for l in texto.splitlines()[:60]]
    for c in candidatos:
        m = _CIDADE_UF.search(c) if c and len(c) < 160 else None
        if m and normalizar_uf(m.group(2)):
            return m.group(1).strip(), normalizar_uf(m.group(2)), bairro
    return None, None, None


_CATEGORIA_URL = re.compile(r"/oferta/leilao/([^/?#]+)(?:/([^/?#]+))?/\d+/")
_LISTA = re.compile(r"/leiloes/\d+(?:[?#/]|$)")
_DATA_TXT = r"(\d{1,2}/\d{1,2}/\d{4})(?:[^\n]*?(\d{1,2}:\d{2}))?"
_LEILAO_TXT = re.compile(
    r"([12])\s*[ºo°]\s*leil[ãa]o\s*(?:Abertura:?\s*" + _DATA_TXT + r"[^\n]*\n\s*)?(?:Encerramento:?\s*" + _DATA_TXT + r")?", re.I)


def _categoria_da_url(url: str) -> tuple[str | None, str | None]:
    m = _CATEGORIA_URL.search(url or "")
    return (m.group(1), m.group(2)) if m else (None, None)


def pagina_de_lista(url: str) -> bool:
    return bool(_LISTA.search(url or ""))


def _datas_do_texto(texto: str) -> dict[str, str]:
    """'1º leilão / Abertura: dd/mm/aaaa a partir das hh:mm / Encerramento: ...' → data_praca1/2 (usa o encerramento)."""
    out: dict[str, str] = {}
    for m in _LEILAO_TXT.finditer(texto or ""):
        n = m.group(1)
        dia, hora = (m.group(4), m.group(5)) if m.group(4) else (m.group(2), m.group(3))
        if not dia:
            continue
        d, mes, a = dia.split("/")
        out[f"data_praca{n}"] = f"{a}-{int(mes):02d}-{int(d):02d}T{(hora or '00:00').zfill(5)}"
    return out


def ler(html: str, texto: str = "", url: str = "") -> dict | object | None:
    return ler_com_motivo(html, texto, url)[0]


def ler_com_motivo(html: str, texto: str = "", url: str = "") -> tuple[dict | object | None, str]:
    """Como `ler`, mas devolve também o motivo quando não leu (para diagnóstico no comando `testar`)."""
    lote = extrair_var_lote(html)
    if not lote and "lv-lote-pagina" in html:
        return ler_lancevip(html, url)
    if not lote and "cdn.frazaoleiloes.com.br" in html and "Informações sobre o Lote" in html:
        return ler_frazao(html, url)
    if not lote and "/evento/anuncio/" in (url or "") and "Comitente" in html:
        return ler_leilaovip(html, url)
    if not lote and "borda-branca-produto" in html and "subtit-produto" in html:
        return ler_smart(html, url)
    if not lote:
        return None, "sem JSON embutido (var lote)"
    if lote.get("status") != 1:  # só lote aberto é lido aqui; os demais seguem o caminho normal
        return None, f"status do lote = {lote.get('status')!r} (só 1=aberto é lido sem IA)"
    categoria_url, sub_url = _categoria_da_url(url)
    if categoria_url and categoria_url != "imoveis":
        return NAO_IMOVEL, "categoria da URL não é imóvel"
    bem = lote.get("bem") or {}
    leilao = lote.get("leilao") or {}
    titulo = _txt(bem.get("siteTitulo")) or _txt(lote.get("descricao")) or _txt(bem.get("descricao"))
    tipo_nome = ""
    tp = bem.get("tipo")
    if isinstance(tp, dict):
        tipo_nome = tp.get("nome") or ""
    tipo_pai = bem.get("tipoPai") or ""
    categoria = simplificar(f"{tipo_pai} {tipo_nome}")
    if categoria.strip() and _NAO_IMOVEL.search(categoria):
        return NAO_IMOVEL, "tipo do bem não é imóvel"
    base = simplificar(f"{categoria} {titulo} {sub_url or ''}")
    if categoria_url != "imoveis" and not _IMOVEL.search(base):
        return None, "sem sinal claro de imóvel no tipo/título"
    cidade, uf, bairro = _local(bem, titulo, texto)
    if not (cidade and uf):
        return None, f"sem cidade/UF (título: {titulo[:80]!r})"
    descricao = _txt(bem.get("siteDescricao")) or _txt(bem.get("descricao")) or _txt(lote.get("descricao"))
    imovel = bem.get("imovel") or {}
    ocupado = imovel.get("ocupado") if isinstance(imovel, dict) else None
    sub_tipo = (sub_url or "").replace("-", " ")
    campos: dict[str, Any] = {
        "id_externo": lote.get("id"),
        "titulo": titulo,
        "descricao": descricao,
        "tipo": tipo_nome or tipo_pai or sub_tipo or None,
        "modalidade": "judicial" if leilao.get("judicial") is True else "extrajudicial" if leilao.get("judicial") is False else None,
        "status": "aberto",
        "uf": uf, "cidade": cidade, "bairro": bairro,
        "endereco": bem.get("endereco") or None,
        "cartorio": bem.get("cartorio") or None,
        "processo": bem.get("processoNumero") or None,
        "valor_avaliacao": _valor(lote.get("valorAvaliacao")),
        "valor_praca1": _valor(lote.get("valorInicial")),
        "valor_praca2": _valor(lote.get("valorInicial2")),
        "data_praca1": _data(leilao.get("dataFimPraca1") or leilao.get("data1")),
        "data_praca2": _data(leilao.get("dataFimPraca2") or leilao.get("data2")),
        "ocupacao": "ocupado" if ocupado is True else "desocupado" if ocupado is False else None,
        "aceita_parcelamento": leilao.get("permitirParcelamento") if isinstance(leilao.get("permitirParcelamento"), bool) else None,
        "leiloeiro": (leilao.get("leiloeiro") or {}).get("nome") if isinstance(leilao.get("leiloeiro"), dict) else None,
        "dados": {"extraido_por": "json_embutido"},
    }
    for k, v in _datas_do_texto(texto).items():  # sites sem datas no JSON: lê "1º leilão / 2º leilão" do texto
        if not campos.get(k):
            campos[k] = v
    if not campos["valor_praca1"] and not campos["valor_avaliacao"]:
        return None, "sem nenhum valor"
    return {k: v for k, v in campos.items() if v not in (None, "")}, ""


# ---------------------------------------------------------------------------------------------
# Lance VIP (lancevip.com.br): página de lote renderizada no servidor, com rótulos <dt>/<dd>.

_REAIS = re.compile(r"R\$\s*([\d.]+,\d{2})")
_PRACA = re.compile(
    r"([12])\s*[ªa]\s*pra[çc]a\s+(\d{2}/\d{2}/\d{4})\s+(\d{1,2}:\d{2})\s+R\$\s*([\d.]+,\d{2})(\s+em vigor)?", re.I)


def _num(br: str | None) -> float | None:
    try:
        return _valor(br.replace(".", "").replace(",", ".")) if br else None
    except AttributeError:
        return None


def ler_lancevip(html: str, url: str = "") -> tuple[dict | object | None, str]:
    s = BeautifulSoup(html, "lxml")
    for x in s(["script", "style"]):
        x.decompose()
    rot: dict[str, str] = {}
    for dt in s.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            rot[simplificar(dt.get_text(" ", strip=True))] = dd.get_text(" ", strip=True)
    categoria = rot.get("categoria", "")
    cat = simplificar(categoria)
    if cat and _NAO_IMOVEL.search(cat):
        return NAO_IMOVEL, f"categoria '{categoria}' não é imóvel"
    h1 = s.find("h1")
    titulo = _txt(h1.get_text(" ", strip=True)) if h1 else ""
    if not (cat and _IMOVEL.search(cat)):
        return None, f"categoria sem sinal claro de imóvel: {categoria!r}"
    sit = s.select_one(".lv-situacao")
    if not sit or "aberto" not in simplificar(sit.get_text(" ", strip=True)):
        return None, f"situação não é 'aberto para lances': {sit.get_text(' ', strip=True) if sit else None!r}"
    cidade, uf = (rot.get("cidade") or "").strip(), normalizar_uf(rot.get("uf"))
    if not (cidade and uf):
        return None, "sem cidade/UF nos rótulos"
    campos: dict[str, Any] = {
        "titulo": titulo,
        "tipo": categoria,
        "status": "aberto",
        "uf": uf, "cidade": cidade,
        "valor_avaliacao": _num((_REAIS.search(rot.get("avaliacao", "")) or [None, None])[1]),
        "processo": None,
        "dados": {"extraido_por": "html_lancevip", "vara": rot.get("vara")},
    }
    m = re.search(r"/leilao/(\d+)/lote/(\d+)", url or "")
    if m:
        campos["id_externo"] = f"{m.group(1)}-{m.group(2)}"
    mod = simplificar(rot.get("modalidade", ""))
    if "judicial" in mod:
        campos["modalidade"] = "judicial"
    elif "venda direta" in mod:
        campos["modalidade"] = "venda_direta"
    # descrição: bloco logo após o título "Descrição do bem"
    for h in s.find_all(["h2", "h3", "h4"]):
        if simplificar(h.get_text(" ", strip=True)).startswith("descricao do bem"):
            alvo = h.find_next_sibling() or h.parent
            campos["descricao"] = _txt(alvo.get_text("\n", strip=True))
            break
    pr = s.select_one(".lv-pracas")
    vigente = None
    if pr:
        for n, dia, hora, val, vig in _PRACA.findall(pr.get_text(" ", strip=True)):
            d, mes, a = dia.split("/")
            campos[f"data_praca{n}"] = f"{a}-{mes}-{d}T{hora.zfill(5)}"
            campos[f"valor_praca{n}"] = _num(val)
            if vig:
                vigente = _num(val)
    lv = s.select_one(".lv-lote-valores")
    if vigente is None and lv:
        r = _REAIS.search(lv.get_text(" ", strip=True))
        vigente = _num(r.group(1)) if r else None
    if vigente:
        campos["lance_minimo"] = vigente
    par = rot.get("parcelamento", "")
    if par:
        campos["aceita_parcelamento"] = True
    foto = s.select_one(".lv-lote-capa-foto") or s.select_one(".lv-lote-capa img")
    src = (foto.get("src") if foto and foto.name == "img" else (foto.find("img").get("src") if foto and foto.find("img") else None))
    if src and "suporteleiloes" in src:
        campos["fotos"] = [src]
    if not (campos.get("valor_avaliacao") or campos.get("lance_minimo")):
        return None, "sem nenhum valor"
    return {k: v for k, v in campos.items() if v not in (None, "")}, ""


# ---------------------------------------------------------------------------------------------
# Leiloaria Smart (leiloariasmart.com.br/imovel/N): HTML do servidor com blocos "Primeira praça / Segunda praça".

_PRACA_SMART = re.compile(r"^(primeira praca|segunda praca|praca unica)\s*:?$")
_DATA_SMART = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s*(?:às|as)?\s*(\d{1,2}:\d{2})", re.I)


def ler_smart(html: str, url: str = "") -> tuple[dict | object | None, str]:
    s = BeautifulSoup(html, "lxml")
    for x in s(["script", "style"]):
        x.decompose()
    linhas = [l for l in s.get_text("\n", strip=True).split("\n") if l]

    def depois(rotulo: str) -> str | None:
        for i, l in enumerate(linhas):
            if simplificar(l).rstrip(":") == rotulo and i + 1 < len(linhas):
                return linhas[i + 1]
        return None

    tipo = depois("tipo")
    try:
        i_desc = linhas.index("Descrição")
    except ValueError:
        return None, "sem bloco 'Descrição'"
    titulo = linhas[i_desc - 1] if i_desc >= 1 else ""
    cat_linha = linhas[i_desc - 2] if i_desc >= 2 else ""
    ref = simplificar(f"{tipo or ''} {cat_linha}")
    if ref.strip() and _NAO_IMOVEL.search(ref):
        return NAO_IMOVEL, f"tipo '{tipo or cat_linha}' não é imóvel"
    if not _IMOVEL.search(ref):
        return None, f"tipo sem sinal claro de imóvel: {tipo!r}/{cat_linha!r}"
    if "O LEILÃO TERMINA EM:" not in linhas:
        return None, "sem contagem regressiva (lote possivelmente encerrado)"
    campos: dict[str, Any] = {"titulo": titulo, "tipo": tipo or cat_linha.lower(), "status": "aberto",
                              "dados": {"extraido_por": "html_smart", "comitente": depois("comitente")}}
    vigente = None
    for el in s.select(".subtit-produto"):
        rot = simplificar(el.get_text(" ", strip=True))
        if not _PRACA_SMART.match(rot):
            continue
        bloco = el.find_next_sibling("div")
        if not bloco:
            continue
        n = "2" if "segunda" in rot else "1"
        m = _DATA_SMART.search(bloco.get_text(" ", strip=True))
        r = _REAIS.search(bloco.get_text(" ", strip=True))
        if m:
            campos[f"data_praca{n}"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}T{m.group(4).zfill(5)}"
        if r:
            campos[f"valor_praca{n}"] = _num(r.group(1))
        encerrada = "through" in (el.get("class") or []) or "through" in (bloco.get("class") or [])
        if r and not encerrada and vigente is None:
            vigente = _num(r.group(1))
    if vigente is None:
        return None, "nenhuma praça em vigor"
    campos["lance_minimo"] = vigente
    loc = depois("localizacao")
    if loc:
        partes = [p.strip() for p in loc.split(",") if p.strip()]
        for k, p in enumerate(partes):
            if re.fullmatch(r"[A-Z]{2}", p) and normalizar_uf(p) and k >= 1:
                campos["uf"], campos["cidade"] = normalizar_uf(p), partes[k - 1]
                if k >= 3:
                    campos["bairro"] = partes[k - 2]
                campos["endereco"] = ", ".join(partes[:k - 1])
                break
    if not (campos.get("uf") and campos.get("cidade")):
        return None, f"sem cidade/UF na localização: {loc!r}"
    sit = simplificar(depois("situacao") or "")
    if sit.startswith("desocupado") or sit.startswith("livre"):
        campos["ocupacao"] = "desocupado"
    elif sit.startswith("ocupado"):
        campos["ocupacao"] = "ocupado"
    mat = depois("matricula")
    if mat and re.fullmatch(r"[\d.\-/ ]+", mat):
        campos["dados"]["matricula"] = mat
    ed = simplificar(next((linhas[j + 1] for j, l in enumerate(linhas) if l == "Edital do leilão" and j + 1 < len(linhas)), ""))
    if "extrajudicial" in ed or "fiduciaria" in ed:
        campos["modalidade"] = "extrajudicial"
    elif "judicial" in ed:
        campos["modalidade"] = "judicial"
    desc = [l for l in linhas[i_desc + 1:] if l not in ("Detalhes do Imóvel",)]
    fim = next((j for j, l in enumerate(desc) if l == "Detalhes do Imóvel"), None)
    corpo = linhas[i_desc + 1: linhas.index("Detalhes do Imóvel")] if "Detalhes do Imóvel" in linhas else desc[:30]
    campos["descricao"] = " ".join(corpo)
    m = re.search(r"/imovel/(\d+)", url or "")
    if m:
        campos["id_externo"] = m.group(1)
    fotos = [i["src"] for i in s.find_all("img") if "/_admin_/upload/" in (i.get("src") or "")]
    if fotos:
        campos["fotos"] = list(dict.fromkeys(fotos))
    return {k: v for k, v in campos.items() if v not in (None, "")}, ""


# ---------------------------------------------------------------------------------------------
# Frazão Leilões (frazaoleiloes.com.br/lote/<id>-<slug>): texto livre, mas com linhas previsíveis.

_MESES = {m: i + 1 for i, m in enumerate("janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro".split())}
_END_UF = re.compile(r",\s*([^,]+?),\s*([A-Z]{2})\s*$")
_CAB_LOCAL = re.compile(r"^([^/]+?)\s*/\s*([A-Z]{2})\s*-\s*(?:BAIRRO\s+|JARDIM\s+)?([^-]+?)\s*-\s", re.I)
_LEILAO_FRAZAO = re.compile(r"Leil[ãa]o:\s*(\d{2})/(\d{2})/(\d{4})\s*(?:às|as)\s*(\d{1,2})h(\d{2})", re.I)


def ler_frazao(html: str, url: str = "") -> tuple[dict | object | None, str]:
    from datetime import datetime
    from ..normalizar import FUSO, tipo as normalizar_tipo

    s = BeautifulSoup(html, "lxml")
    for x in s(["script", "style"]):
        x.decompose()
    linhas = [l for l in s.get_text("\n", strip=True).split("\n") if l]
    try:
        i_lote = next(i for i, l in enumerate(linhas) if re.fullmatch(r"Lote\s+[\d-]+", l))
        i_info = linhas.index("Informações sobre o Lote")
    except (StopIteration, ValueError):
        return None, "estrutura do lote não reconhecida"
    evento = linhas[i_lote - 1] if i_lote >= 1 else ""
    titulo = linhas[i_lote + 1] if i_lote + 1 < len(linhas) else ""
    endereco = linhas[i_lote + 2] if i_lote + 2 < len(linhas) else ""
    cabecalho = linhas[i_info + 1] if i_info + 1 < len(linhas) else ""
    try:
        fim = next(j for j in range(i_info + 1, len(linhas)) if linhas[j] in ("Envio de Proposta", "Consulte o edital e documentação"))
    except StopIteration:
        fim = min(len(linhas), i_info + 40)
    corpo = " ".join(linhas[i_info + 1: fim])
    base = simplificar(f"{titulo} {cabecalho} {corpo[:500]}")
    if _NAO_IMOVEL.search(simplificar(titulo)) and not _IMOVEL.search(simplificar(titulo)):
        return NAO_IMOVEL, f"título não é de imóvel: {titulo[:70]!r}"
    if not _IMOVEL.search(base):
        return None, f"sem sinal claro de imóvel: {titulo[:70]!r}"
    cidade = uf = bairro = None
    m = _CAB_LOCAL.match(cabecalho)
    if m and normalizar_uf(m.group(2)):
        cidade, uf, bairro = m.group(1).strip().title(), normalizar_uf(m.group(2)), m.group(3).strip().title()
    m = _END_UF.search(endereco)
    if m and normalizar_uf(m.group(2)):
        cidade, uf = m.group(1).strip(), normalizar_uf(m.group(2))
    if not (cidade and uf):
        return None, f"sem cidade/UF (endereço: {endereco[:70]!r})"
    if not bairro:  # linhas do tipo "Centro - Ituiutaba/MG - Sala comercial..."
        mb = re.compile(r"^([^-/\n]{2,40}?)\s*-\s*" + re.escape(cidade) + r"\s*/\s*" + uf + r"\b", re.I)
        bairro = next((m.group(1).strip() for l in linhas[i_info:fim] if (m := mb.match(l))), None)
    campos: dict[str, Any] = {
        "titulo": titulo, "descricao": corpo[:3000], "tipo": normalizar_tipo(None, re.sub(r"(?i)com\s+\d+\s+vagas?(?: de garagem)?", "", titulo), re.sub(r"(?i)com\s+\d+\s+vagas?(?: de garagem)?", "", cabecalho)),
        "uf": uf, "cidade": cidade, "bairro": bairro, "endereco": endereco,
        "status": "aberto", "dados": {"extraido_por": "html_frazao", "evento": evento},
    }
    ocup = simplificar(next((l for l in linhas[i_lote:i_lote + 8] if l.lower().startswith("imóvel ")), ""))
    if "desocupado" in ocup or "livre" in ocup:
        campos["ocupacao"] = "desocupado"
    elif "ocupado" in ocup or "locado" in ocup:
        campos["ocupacao"] = "ocupado"
    texto = "\n".join(linhas)
    n = "2" if re.match(r"\s*2\s*[ºo°]", evento) else "1"
    datas: dict[str, "datetime"] = {}

    def _marca(num: str, a: int, mes: int, d: int, hh: int, mm: str) -> None:
        campos[f"data_praca{num}"] = f"{a}-{mes:02d}-{d:02d}T{hh:02d}:{mm}"
        datas[num] = datetime(a, mes, d, hh, int(mm), tzinfo=FUSO)

    for m in re.finditer(r"([12])\s*[ºo°]\s*leil[ãa]o:\s*(\d{1,2}) de (\w+) de (\d{4}),?\s*(?:às|as)\s*(\d{1,2})h(\d{2})(?:[^R\n]{0,40}R\$\s*([\d.]+,\d{2}))?", texto, re.I):
        mes = _MESES.get(simplificar(m.group(3)))
        if mes:
            _marca(m.group(1), int(m.group(4)), mes, int(m.group(2)), int(m.group(5)), m.group(6))
            if m.group(7):
                campos[f"valor_praca{m.group(1)}"] = _num(m.group(7))
    if not datas:
        for m in re.finditer(r"(?:([12])\s*[ºo°]\s*)?leil[ãa]o:\s*(\d{2})/(\d{2})/(\d{4})\s*(?:às|as)\s*(\d{1,2})h(\d{2})", texto, re.I):
            _marca(m.group(1) or n, int(m.group(4)), int(m.group(3)), int(m.group(2)), int(m.group(5)), m.group(6))
    if datas and max(datas.values()) < datetime.now(FUSO):
        campos["status"] = "encerrado"
    for i, l in enumerate(linhas):
        if l.rstrip(":").lower() == "lance inicial" and i + 1 < len(linhas):
            r = _REAIS.search(linhas[i + 1])
            if r:
                campos["lance_minimo"] = campos[f"valor_praca{n}"] = _num(r.group(1))
            break
    a = re.search(r"avalia[çc][ãa]o[^R\n]{0,40}R\$\s*([\d.]+,\d{2})", texto, re.I)
    if a:
        campos["valor_avaliacao"] = _num(a.group(1))
    if not (campos.get("lance_minimo") or campos.get("valor_avaliacao")):
        return None, "sem nenhum valor"
    m = re.search(r"/lote/(\d+)", url or "")
    if m:
        campos["id_externo"] = m.group(1)
    fotos = [i.get("src") for i in s.find_all("img") if "/images/lot/" in (i.get("src") or "")]
    if fotos:
        campos["fotos"] = list(dict.fromkeys(fotos))[:20]
    return {k: v for k, v in campos.items() if v not in (None, "")}, ""


# ---------------------------------------------------------------------------------------------
# Leilão VIP (leilaovip.com.br/evento/anuncio/<slug>-<id>): rótulos em linhas ("Status:", "Cidade:"...).

_DATA_HORA = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}:\d{2})")


def ler_leilaovip(html: str, url: str = "") -> tuple[dict | object | None, str]:
    from datetime import datetime
    from ..normalizar import FUSO

    s = BeautifulSoup(html, "lxml")
    for x in s(["script", "style"]):
        x.decompose()
    linhas = [l.strip() for l in s.get_text("\n", strip=True).split("\n") if l.strip()]

    def depois(rotulo: str, n: int = 1) -> str | None:
        for i, l in enumerate(linhas):
            if l.rstrip(":").strip().lower() == rotulo.lower() and i + n < len(linhas):
                return linhas[i + n]
        return None

    status = depois("Status") or ""
    if not simplificar(status).startswith("aberto"):
        return None, f"status do lote: {status!r}"
    categoria = depois("Categoria") or ""
    titulo = depois("LOTE 1") if False else next((linhas[i + 1] for i, l in enumerate(linhas) if re.fullmatch(r"LOTE\s+\d+:", l, re.I)), "")
    ref = simplificar(f"{categoria} {titulo}")
    if _NAO_IMOVEL.search(simplificar(categoria)):
        return NAO_IMOVEL, f"categoria '{categoria}' não é imóvel"
    if not _IMOVEL.search(ref):
        return None, f"sem sinal claro de imóvel: {categoria!r} / {titulo[:60]!r}"
    cidade, uf = (depois("Cidade") or "").strip().title(), normalizar_uf(depois("Estado"))
    if not (cidade and uf):
        return None, "sem cidade/UF"
    endereco = depois("Endereço") or ""
    partes = [p.strip() for p in endereco.split(",") if p.strip()]
    campos: dict[str, Any] = {
        "titulo": titulo, "tipo": categoria, "status": "aberto", "uf": uf, "cidade": cidade,
        "endereco": endereco or None, "bairro": partes[-1].title() if len(partes) >= 3 else None,
        "processo": depois("Processo"), "leiloeiro": depois("Leiloeiro"),
        "dados": {"extraido_por": "html_leilaovip"},
    }
    tl = simplificar(depois("Tipo de Leilão") or "")
    campos["modalidade"] = "extrajudicial" if "extra" in tl else "judicial" if "judicial" in tl else None
    com = next((l for l in linhas if l.startswith("Comitente:")), "")
    if com:
        campos["dados"]["comitente"] = com.split(":", 1)[1].strip()
    cep = depois("CEP")
    if cep:
        campos["dados"]["cep"] = cep
    pracas: dict[str, tuple[str | None, float | None]] = {}
    for i, l in enumerate(linhas):
        m = re.fullmatch(r"([12])\s*[ºo°]\s*Leil[ãa]o", l, re.I)
        if m and i + 2 < len(linhas):
            d = _DATA_HORA.search(linhas[i + 1])
            r = _REAIS.search(linhas[i + 2])
            if d and r:
                pracas[m.group(1)] = (f"{d.group(3)}-{d.group(2)}-{d.group(1)}T{d.group(4).zfill(5)}", _num(r.group(1)))
    for n, (dt, val) in pracas.items():
        campos[f"data_praca{n}"], campos[f"valor_praca{n}"] = dt, val
    if len(pracas) == 2:
        campos["valor_avaliacao"] = pracas["1"][1]
    vigente = None
    for i, l in enumerate(linhas):
        if l == "Inicial":
            for k in linhas[i + 1: i + 4]:
                mm = re.fullmatch(r"(?:R\$\s*)?([\d.]+,\d{2})", k)
                if mm:
                    vigente = _num(mm.group(1))
                    break
            break
    if vigente is None and pracas:
        agora = datetime.now(FUSO)
        futuras = [v for _, (dt, v) in sorted(pracas.items()) if dt and datetime.fromisoformat(dt).replace(tzinfo=FUSO) >= agora]
        vigente = (futuras or [v for _, (_, v) in sorted(pracas.items())])[0 if futuras else -1]
    if vigente:
        campos["lance_minimo"] = vigente
    if not (campos.get("lance_minimo") or campos.get("valor_avaliacao")):
        return None, "sem nenhum valor"
    try:
        i0 = next(i for i, l in enumerate(linhas) if l == "Leiloeiro:" or l == "Leiloeiro") + 2
        campos["descricao"] = " ".join(linhas[i0: i0 + 40])[:3000]
    except StopIteration:
        pass
    m = re.search(r"-(\d+)/?$", (url or "").split("?")[0])
    if m:
        campos["id_externo"] = m.group(1)
    fotos = [i.get("src") for i in s.find_all("img") if "blob.core.windows.net/uploads" in (i.get("src") or "")]
    if fotos:
        campos["fotos"] = list(dict.fromkeys(fotos))[:20]
    return {k: v for k, v in campos.items() if v not in (None, "")}, ""
