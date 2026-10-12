"""Descoberta de lotes em sites que listam por JavaScript (formulário + token), sem IA e sem navegador.

Cada função recebe o adaptador `Automatico` (usa o cliente HTTP dele, que guarda cookies) e devolve as URLs de lote.
Ativada no YAML da fonte com `descoberta: <nome>`.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

_EVENTO = re.compile(r"/evento/detalhes/([^\"'?<>\s#]+)")
_ANUNCIO = re.compile(r"""href=["'](/evento/anuncio/[^"'<>\s]+)["']""")


def campos_do_formulario(html: str, form_id: str) -> dict[str, str]:
    """Todos os campos (inputs e selects) de um formulário, com o valor atual; inclui o token anti-falsificação."""
    form = BeautifulSoup(html, "lxml").find("form", id=form_id)
    dados: dict[str, str] = {}
    if not form:
        return dados
    for el in form.find_all(["input", "select"]):
        nome = el.get("name")
        if not nome:
            continue
        if el.name == "select":
            op = el.find("option", selected=True)
            dados[nome] = op.get("value", "") if op else ""
        else:
            dados[nome] = el.get("value", "")
    return dados


def eventos_da_agenda(html: str) -> list[str]:
    return list(dict.fromkeys(_EVENTO.findall(html)))


def anuncios_do_evento(html: str) -> list[str]:
    return list(dict.fromkeys(_ANUNCIO.findall(html)))


def leilaovip(a, segmento: str = "IMÓVEIS", max_paginas_agenda: int = 40, max_paginas_evento: int = 40) -> list[str]:
    """Leilão VIP: agenda (POST handler=pesquisarEventos, 24 eventos por página) → cada evento (POST handler=pesquisar, pageNumber)."""
    inicio = a.fonte.get("inicio") or ["https://www.leilaovip.com.br"]
    base = "https://" + re.sub(r"^https?://", "", inicio[0] if isinstance(inicio, list) else inicio).split("/")[0]
    cab = {"X-Requested-With": "XMLHttpRequest"}
    r = a.cliente.get(base + "/agenda")
    campos = campos_do_formulario(r.text, "formAgenda")
    campos["Filtro.Segmento"] = segmento
    codigos: list[str] = []
    for pg in range(1, max_paginas_agenda + 1):
        campos["Filtro.CurrentPage"] = str(pg)
        try:
            r = a.cliente.post(base + "/agenda", params={"handler": "pesquisarEventos"}, data=campos,
                               headers={**cab, "Referer": base + "/agenda"})
        except Exception as e:
            a.registrar_erro(f"Agenda página {pg}: {e}")
            break
        novos = [c for c in eventos_da_agenda(r.text) if c not in codigos]
        if not novos:
            break
        codigos += novos
    lotes: list[str] = []
    for cod in codigos:
        url_ev = f"{base}/evento/detalhes/{cod}"
        try:
            r = a.cliente.get(url_ev)
            dados = campos_do_formulario(r.text, "formPost")
        except Exception as e:
            a.registrar_erro(f"Evento {cod}: {e}")
            continue
        for pg in range(1, max_paginas_evento + 1):
            params = {"handler": "pesquisar"} if pg == 1 else {"pageNumber": str(pg), "handler": "pesquisar"}
            try:
                r = a.cliente.post(url_ev, params=params, data=dados, headers={**cab, "Referer": url_ev})
            except Exception as e:
                a.registrar_erro(f"Evento {cod} página {pg}: {e}")
                break
            novos = [urljoin(base, l) for l in anuncios_do_evento(r.text)]
            novos = [l for l in novos if l not in lotes]
            if not novos:
                break
            lotes += novos
    return lotes


DESCOBERTAS = {"leilaovip": leilaovip}
