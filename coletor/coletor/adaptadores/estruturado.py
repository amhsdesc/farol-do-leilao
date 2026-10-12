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
_EVENTO = re.compile(r"/eventos/leilao/\d+/[^/?#]+/?(?:[?#].*)?$")


# Páginas de navegação que nunca são um lote (lista de lotes, planilha, sala online, login...).
_NAVEGACAO = re.compile(r"/(?:lotes/lista|planilha|online|auditorio[^/?#]*|arrematante/[^/?#]+|login|cadastro)/?(?:[?#].*)?$", re.I)


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
