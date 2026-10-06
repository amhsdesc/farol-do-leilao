"""Presets de plataformas de leilão: um leitor sem IA para todos os sites que usam o mesmo software.

Muitos leiloeiros usam a mesma plataforma (leilao.pro, por exemplo). Em vez de pagar a IA para ler cada
página de lote, a fonte `automatico` abre a página inicial, reconhece a plataforma e passa a ler a listagem
de imóveis por seletores CSS. Se o preset não achar nada, a fonte continua pelo caminho com IA.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

# Cada preset: assinatura no HTML da página inicial + configuração `seletores` (sem a url base).
PRESETS: dict[str, dict[str, Any]] = {
    "leilao_pro": {
        "assinatura": r"leilao\.pro|/leilao/lotes/|lote_id/\d+",
        "listagem": {
            "caminho": "/leilao/lotes/imoveis",
            "item": ".card-vertical",
            "campos": {
                "url": {"css": ".card-title a", "attr": "href"},
                "id_externo": {"css": ".card-title a", "attr": "href", "regex": "lote_id/(\\d+)"},
                "titulo": {"css": ".card-image img", "attr": "alt"},
                "descricao": {"css": ".card-image img", "attr": "alt"},
                "cidade": {"css": ".card-image img", "attr": "alt",
                           "regex": "([A-Za-zÀ-ÿ' ]{3,40}?)\\s*-\\s*[A-Z]{2}\\b"},
                "uf": {"css": ".card-image img", "attr": "alt", "regex": "[A-Za-zÀ-ÿ' ]\\s*-\\s*([A-Z]{2})\\b"},
                "comitente": {"css": ".info-title"},
                "lance_minimo": {"css": ".bid-value"},
                "data_praca1": {"css": ".meta-item", "regex": "(\\d{2}/\\d{2}/\\d{4}\\s*\\d{2}:\\d{2})"},
            },
        },
    },
}


# Plataformas com API JSON própria: têm um adaptador dedicado (ver suaplataforma.py).
ADAPTADORES = {"suaplataforma": r"suaplataformadeleilao|ApiEngine/"}


def detectar(html: str) -> str | None:
    for nome, padrao in ADAPTADORES.items():
        if re.search(padrao, html, re.I):
            return nome
    for nome, p in PRESETS.items():
        if re.search(p["assinatura"], html, re.I):
            return nome
    return None


def fonte_do_preset(fonte: dict[str, Any], nome: str, url_inicio: str) -> dict[str, Any]:
    """Monta a configuração `seletores` equivalente para a fonte, usando o domínio da URL inicial."""
    u = urlparse(url_inicio)
    base = f"{u.scheme}://{u.netloc}"
    p = PRESETS[nome]["listagem"]
    nova = {k: v for k, v in fonte.items() if k not in ("inicio", "navegador")}
    nova["tipo"] = "seletores"
    nova["navegador"] = False
    nova["listagem"] = {
        "url": base + p["caminho"],
        "item": p["item"],
        "campos": p["campos"],
    }
    return nova
