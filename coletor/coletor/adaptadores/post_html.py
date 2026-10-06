"""Adaptador para sites que respondem a uma consulta POST com um JSON que traz a lista de lotes em HTML (ex.: Seu Imóvel BB).

Sem IA e sem navegador. Passos: abre a página do catálogo, pega o token que o site exige (um elemento da página),
e pede cada página de resultados; os cards vêm em HTML dentro do JSON e são lidos por seletor CSS.

Configuração:
    tipo: post_html
    requisicao:
      pagina_token: https://site/catalogo/categoria/urbanos     # página que contém o token
      token_css: "#_cppnp"                                       # onde está o token
      url: https://site/catalogo                                 # onde as páginas são pedidas
      params: {pagina: "{pagina}", cppnp: "{token}", ...}
      campo_html: lista                                          # chave do JSON com o HTML dos cards
      campo_total: imoveis                                       # chave do JSON com o total (opcional)
      por_pagina: 50
      paginas_max: 60
    item: ".carta"
    campos: {...}                                                # mini-linguagem de extracao.py, por card
    # um campo "link" nos campos vira a URL do lote
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Iterator
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from ..modelos import LoteBruto
from .base import Adaptador, ErroDeFonte
from .extracao import Extrator

_DIA_MES = re.compile(r"(\d{1,2})/(\d{1,2})(?!/\d)\s*(?:às|as|a partir das)?\s*(\d{1,2})\s*h(?:(\d{2}))?", re.I)


def completar_ano(texto: Any) -> Any:
    """'13/10 às 10h' → '13/10/2026 10:00' (usa o próximo dia/mês que ainda vai acontecer). Outro formato passa igual."""
    if not isinstance(texto, str):
        return texto
    m = _DIA_MES.search(texto)
    if not m:
        return texto
    dia, mes, hora, minuto = int(m[1]), int(m[2]), int(m[3]), int(m[4] or 0)
    agora = datetime.now(ZoneInfo("America/Sao_Paulo"))
    for ano in (agora.year, agora.year + 1):
        try:
            d = datetime(ano, mes, dia, hora, minuto, tzinfo=agora.tzinfo)
        except ValueError:
            return texto
        if (d - agora).days >= -2:  # leilão de hoje/ontem ainda conta como deste ano
            return f"{dia:02d}/{mes:02d}/{ano} {hora:02d}:{minuto:02d}"
    return texto


class PostHtml(Adaptador):
    tipo = "post_html"

    def _token(self, req: dict[str, Any]) -> str:
        pagina = BeautifulSoup(self.cliente.get(req["pagina_token"]).text, "lxml")
        el = pagina.select_one(req.get("token_css", "#token"))
        token = (el.get(req["token_attr"]) if req.get("token_attr") else el.get_text(strip=True)) if el else ""
        token = token or ""
        if not token:
            raise ErroDeFonte(f"Token não encontrado em {req['pagina_token']} ({req.get('token_css')}).")
        return token

    @staticmethod
    def _preencher(obj: Any, pagina: int, token: str, offset: int = 0) -> Any:
        if isinstance(obj, str):
            return (obj.replace("{pagina}", str(pagina)).replace("{token}", token)
                    .replace("{offset}", str(offset)))
        if isinstance(obj, dict):
            return {k: PostHtml._preencher(v, pagina, token, offset) for k, v in obj.items()}
        return obj

    def coletar(self) -> Iterator[LoteBruto]:
        req = self.fonte.get("requisicao") or {}
        for k in ("url", "pagina_token", "item"):
            if not (req.get(k) or self.fonte.get(k)):
                raise ErroDeFonte(f"Informe {k} no YAML.")
        token = self._token(req)
        vistos: set[str] = set()
        total_esperado = None
        for pagina in range(1, int(req.get("paginas_max", 60)) + 1):
            try:
                r = self.cliente.post(
                    req["url"], data=self._preencher(req.get("params") or {}, pagina, token,
                                                     (pagina - 1) * int(req.get("por_pagina", 0))),
                    headers={"X-Requested-With": "XMLHttpRequest"},
                )
                dados = {req.get("campo_html", "lista"): r.text} if req.get("resposta") == "html" else r.json()
            except Exception as e:
                self.registrar_erro(f"Página {pagina}: {e}")
                break
            if total_esperado is None and req.get("campo_total"):
                total_esperado = dados.get(req["campo_total"])
            html = dados.get(req.get("campo_html", "lista")) or ""
            sopa = BeautifulSoup(html, "lxml")
            itens = sopa.select(self.fonte["item"])
            novos = 0
            for item in itens:
                ex = Extrator(item, url=req["url"])
                campos: dict[str, Any] = ex.campos(self.fonte.get("campos") or {})
                for k in ("data_praca1", "data_praca2"):
                    if k in campos:
                        campos[k] = completar_ano(campos[k])
                link = campos.pop("link", None)  # o Extrator já devolve o endereço completo
                if link:
                    campos["url"] = link
                lote = self.montar(campos)
                if lote and lote.id_externo not in vistos:
                    vistos.add(lote.id_externo)
                    novos += 1
                    yield lote
            if novos == 0:
                break
        if total_esperado and len(vistos) < int(str(total_esperado).replace(".", "")) * 0.9:
            self.registrar_erro(f"Leu {len(vistos)} de {total_esperado} imóveis anunciados pelo site.")
