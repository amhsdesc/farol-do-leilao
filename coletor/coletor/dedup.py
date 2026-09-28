"""Chaves de deduplicação: o mesmo imóvel anunciado em várias fontes vira uma ficha só.

Ordem de confiança:
  1. matrícula + cartório  (identifica o imóvel juridicamente)
  2. número do imóvel na Caixa (quando um leiloeiro revende lote da Caixa e cita o número)
  3. endereço normalizado com número + área arredondada (heurística)
"""
from __future__ import annotations

import re

from .modelos import Lote
from .normalizar import simplificar


def _digitos(texto: str | None) -> str:
    return re.sub(r"\D", "", texto or "").lstrip("0")


def chaves(lote: Lote, fonte_id: str) -> list[str]:
    out: list[str] = []

    mat = _digitos(lote.matricula)
    if mat:
        cart = re.sub(r"\W+", "", simplificar(lote.cartorio)) if lote.cartorio else ""
        cart = _digitos(cart) or cart[:40]
        if cart:
            out.append(f"mat:{lote.uf or '??'}:{cart}:{mat}")

    if "caixa" in simplificar(lote.leiloeiro) and re.fullmatch(r"\d{13}", lote.id_externo or ""):
        out.append(f"caixa:{_digitos(lote.id_externo)}")
    else:
        texto = " ".join(filter(None, [lote.titulo, lote.descricao]))
        if "caixa" in simplificar(texto):
            m = re.search(r"\b(\d{13})\b", texto)
            if m:  # número de imóvel Caixa citado por leiloeiro que revende o lote
                out.append(f"caixa:{m.group(1).lstrip('0')}")

    end = lote.endereco_normalizado
    if end and re.search(r"\d", end) and lote.uf and lote.cidade:
        a = lote.area_privativa or lote.area_total or lote.area_terreno
        area_txt = str(int(round(float(a)))) if a else "?"
        cidade = simplificar(lote.cidade).replace(" ", "-")
        out.append(f"end:{lote.uf}:{cidade}:{end}:{area_txt}")

    # sem nenhuma chave forte: o imóvel fica isolado (uma ficha por lote)
    out.append(f"lote:{fonte_id}:{lote.id_externo}")
    return out
