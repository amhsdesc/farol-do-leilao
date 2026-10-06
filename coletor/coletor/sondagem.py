"""Sonda as fontes que não trazem lotes e diz, para cada uma, POR QUE (sem IA, só HTTP simples).

Para cada fonte: abre a primeira página (a de `inicio`, `listagem.url` ou `requisicao.url`) e classifica:
  erro_http      o site não respondeu, bloqueou ou o robots.txt não deixa
  lotes_no_html  há links que parecem de lote no HTML: o site TEM imóveis e a fonte deveria ler (configuração a consertar)
  js             pouco texto e muito script: o site monta a lista por JavaScript (precisa de navegador ou da API dele)
  sem_lotes      página normal sem links de lote: provavelmente sem imóveis hoje, ou o padrão de link está errado
Também mostra a plataforma reconhecida (Soleon, Leilotech...), o que permite resolver várias fontes com um leitor só.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .adaptadores.automatico import HEURISTICA_LOTE
from .config import config
from .http import Cliente
from .inspecionar import identificar_plataforma


def primeira_url(fonte: dict[str, Any]) -> str | None:
    inicio = fonte.get("inicio")
    if isinstance(inicio, str):
        return inicio
    if inicio:
        return inicio[0]
    for chave in ("listagem", "requisicao"):
        u = (fonte.get(chave) or {}).get("url")
        if u:
            u = u[0] if isinstance(u, list) else u
            return re.sub(r"\{pagina\}", "1", u)
    return fonte.get("site")


def sondar_fonte(fonte: dict[str, Any], cliente: Cliente) -> dict[str, Any]:
    url = primeira_url(fonte)
    r: dict[str, Any] = {"fonte": fonte["id"], "tipo": fonte.get("tipo"), "url": url, "veredito": "", "plataforma": "",
                         "status_http": "", "texto_util": 0, "scripts": 0, "links_lote": 0, "exemplo": "", "detalhe": ""}
    if not url:
        r["veredito"], r["detalhe"] = "erro_http", "fonte sem URL"
        return r
    try:
        resp = cliente.get(url)
    except Exception as e:
        r["veredito"], r["detalhe"] = "erro_http", f"{type(e).__name__}: {str(e)[:120]}"
        return r
    html = resp.text
    r["status_http"] = resp.status_code
    r["plataforma"] = ",".join(identificar_plataforma(html))
    sopa = BeautifulSoup(html, "lxml")
    r["scripts"] = len(sopa.find_all("script"))
    padrao = re.compile(fonte["padrao_link_lote"], re.I) if fonte.get("padrao_link_lote") else HEURISTICA_LOTE
    dominio = urlparse(url).netloc
    links = []
    for a in sopa.select("a[href]"):
        href = urljoin(url, a["href"]).split("#")[0]
        if urlparse(href).netloc == dominio and padrao.search(href) and href not in links:
            links.append(href)
    for t in sopa(["script", "style", "noscript", "svg"]):
        t.decompose()
    r["texto_util"] = len(sopa.get_text(" ", strip=True))
    r["links_lote"] = len(links)
    r["exemplo"] = links[0] if links else ""
    if links:
        r["veredito"] = "lotes_no_html"
    elif r["texto_util"] < 500 and r["scripts"] >= 3:
        r["veredito"] = "js"
    else:
        r["veredito"] = "sem_lotes"
    if fonte.get("navegador"):
        r["detalhe"] = "fonte usa navegador; a sondagem lê só o HTML bruto"
    return r


def sondar(fontes: list[dict[str, Any]], destino: Path | None = None) -> list[dict[str, Any]]:
    destino = destino or (config.pasta_dados / "sondagem.csv")
    destino.parent.mkdir(parents=True, exist_ok=True)
    out = []
    with Cliente(intervalo=0.5) as cliente:
        for f in fontes:
            out.append(sondar_fonte(f, cliente))
    if out:
        with destino.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(out[0]))
            w.writeheader()
            w.writerows(out)
    return out
