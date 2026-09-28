"""Ferramentas para adicionar sites rapidamente.

`inspecionar URL`: abre a página, identifica a plataforma (software) do site, lista as respostas JSON
que ela carrega (candidatas a `json_api`), os links que parecem de lote e salva tudo em dados/inspecao/.

`nova-fonte URL`: cria um YAML inicial em fontes/ (tipo automatico), pronto para testar e depois refinar.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .adaptadores.automatico import HEURISTICA_LOTE
from .config import config
from .http import Cliente

# Assinaturas de softwares usados por leiloeiros. Amplie conforme descobrir novas.
PLATAFORMAS = {
    "soleon": [r"soleon"],
    "leilotech": [r"leilotech"],
    "leilao_pro": [r"leilao\.pro"],
    "roisoft": [r"roisoft"],
    "suaplataformadeleilao": [r"suaplataformadeleilao"],
    "superbid": [r"superbid", r"sbwebservices"],
    "ebl": [r"eblmarketing", r"ebl online"],
    "wordpress": [r"wp-content", r"wp-json"],
}
CHAVES_DE_LOTE = {"lote", "lotes", "leilao", "avaliacao", "lance", "praca", "imovel", "valor", "matricula", "edital"}


@dataclass
class Relatorio:
    url: str
    plataformas: list[str] = field(default_factory=list)
    links_lote: list[str] = field(default_factory=list)
    respostas_json: list[dict] = field(default_factory=list)
    pasta: Path | None = None


def identificar_plataforma(html: str) -> list[str]:
    baixo = html.lower()
    return [nome for nome, padroes in PLATAFORMAS.items() if any(re.search(p, baixo) for p in padroes)]


def _pontuar_json(obj, profundidade: int = 0) -> int:
    """Quantas chaves com cara de lote aparecem no JSON (para ordenar as candidatas)."""
    if profundidade > 4:
        return 0
    if isinstance(obj, dict):
        return sum(1 for k in obj if any(c in k.lower() for c in CHAVES_DE_LOTE)) + sum(
            _pontuar_json(v, profundidade + 1) for v in list(obj.values())[:20])
    if isinstance(obj, list) and obj:
        return _pontuar_json(obj[0], profundidade + 1) * 2 if len(obj) > 1 else _pontuar_json(obj[0], profundidade + 1)
    return 0


def inspecionar(url: str, usar_navegador: bool = True) -> Relatorio:
    rel = Relatorio(url=url)
    dominio = urlparse(url).netloc
    pasta = config.pasta_dados / "inspecao" / dominio.replace(":", "_")
    pasta.mkdir(parents=True, exist_ok=True)
    rel.pasta = pasta
    html = ""
    if usar_navegador:
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                nav = p.chromium.launch()
                pagina = nav.new_page(user_agent=config.user_agent, locale="pt-BR")
                capturas = []

                def ao_responder(resp):
                    if "json" in (resp.headers.get("content-type") or ""):
                        try:
                            capturas.append((resp.request.method, resp.url, resp.json()))
                        except Exception:
                            pass

                pagina.on("response", ao_responder)
                pagina.goto(url, wait_until="networkidle", timeout=60000)
                pagina.wait_for_timeout(2000)
                html = pagina.content()
                nav.close()
            for i, (metodo, u, corpo) in enumerate(sorted(capturas, key=lambda x: -_pontuar_json(x[2]))[:15]):
                arq = pasta / f"resposta_{i:02d}.json"
                arq.write_text(json.dumps(corpo, ensure_ascii=False, indent=2)[:500_000], encoding="utf-8")
                rel.respostas_json.append({"metodo": metodo, "url": u, "pontos": _pontuar_json(corpo), "arquivo": arq.name})
        except ImportError:
            usar_navegador = False
    if not usar_navegador:
        with Cliente() as c:
            html = c.get(url).text
    (pasta / "pagina.html").write_text(html, encoding="utf-8")
    rel.plataformas = identificar_plataforma(html)
    sopa = BeautifulSoup(html, "lxml")
    for a in sopa.select("a[href]"):
        href = urljoin(url, a["href"]).split("#")[0]
        if urlparse(href).netloc == dominio and HEURISTICA_LOTE.search(href) and href not in rel.links_lote:
            rel.links_lote.append(href)
    (pasta / "relatorio.json").write_text(
        json.dumps({"url": url, "plataformas": rel.plataformas, "links_lote": rel.links_lote[:100],
                    "respostas_json": rel.respostas_json}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return rel


def slug(texto: str) -> str:
    t = re.sub(r"^www\.", "", urlparse(texto).netloc or texto)
    t = re.sub(r"\.(com|net|org|leilao|adv)?\.?br$|\.com$", "", t)
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def nova_fonte(url: str, uf: list[str], nome: str | None = None, pasta: Path | None = None) -> Path:
    pasta = pasta or config.pasta_fontes / "leiloeiros"
    pasta.mkdir(parents=True, exist_ok=True)
    id_ = slug(url)
    arquivo = pasta / f"{id_}.yaml"
    if arquivo.exists():
        raise FileExistsError(arquivo)
    site = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    arquivo.write_text(
        f"""# Criado por `nova-fonte`. Teste com: python -m coletor coletar {id_}
# Quando o volume justificar, troque para json_api ou seletores (mais barato que o automático).
id: {id_}
nome: {nome or urlparse(url).netloc}
site: {site}
tipo: automatico
uf: [{', '.join(uf)}]
inicio:
  - {url}
# padrao_link_lote: "/lote/\\\\d+"   # descomente e ajuste para melhorar a precisão
max_paginas_lista: 10
max_lotes: 200
navegador: false
""",
        encoding="utf-8",
    )
    return arquivo
