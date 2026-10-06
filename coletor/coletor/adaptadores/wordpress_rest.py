"""Adaptador para sites WordPress que publicam os imóveis como um tipo de post (ex.: Santander Imóveis).

Sem IA e sem navegador. Duas etapas:
  1. Lista os imóveis pela API REST do WordPress (id, link, título e data de modificação), 100 por página.
  2. Para cada imóvel NOVO ou MODIFICADO, lê a página de detalhe (HTML comum) e extrai os campos por regra.
     Para o imóvel que não mudou desde a última coleta, reaproveita o que já foi lido (tabela pagina_cache,
     chave "wp:" + link, guardando a data de modificação). Assim a coleta completa é rápida e barata,
     e uma mudança de preço ou de data é pega na rodada seguinte.

Configuração:
    tipo: wordpress_rest
    requisicao:
      url: https://www.site.com.br/wp-json/wp/v2/estate_property
      por_pagina: 100
      paginas_max: 100
    detalhe:
      campos: {...}                 # mini-linguagem de extracao.py, aplicada à página do imóvel
    titulo_remove: " | Santander Imóveis"    # sufixo a tirar do título (opcional)
    max_detalhes_por_execucao: 3000          # páginas novas lidas por rodada (a carga inicial se espalha por várias)
"""
from __future__ import annotations

import html
import re
from typing import Any, Iterator

from bs4 import BeautifulSoup
from psycopg.types.json import Jsonb

from ..modelos import LoteBruto
from .base import Adaptador, ErroDeFonte
from .extracao import Extrator


class WordpressRest(Adaptador):
    tipo = "wordpress_rest"

    # ---------------------------------------------------------------- cache por imóvel

    def _ler_cache(self, chave: str) -> tuple[str, dict] | None:
        if not self.conn:
            return None
        with self.conn.cursor() as cur:
            cur.execute("select hash_texto, extraido from pagina_cache where url = %s", (chave,))
            r = cur.fetchone()
        self.conn.rollback()
        return (r["hash_texto"], r["extraido"] or {}) if r else None

    def _gravar_cache(self, chave: str, versao: str, campos: dict) -> None:
        if not self.conn:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                """insert into pagina_cache (url, hash_texto, extraido) values (%s, %s, %s)
                   on conflict (url) do update set hash_texto = excluded.hash_texto,
                   extraido = excluded.extraido, atualizado_em = now()""",
                (chave, versao, Jsonb(campos)),
            )
        self.conn.commit()

    # ---------------------------------------------------------------- listagem

    def _itens(self) -> Iterator[dict[str, Any]]:
        req = self.fonte.get("requisicao") or {}
        if not req.get("url"):
            raise ErroDeFonte("Informe requisicao.url no YAML.")
        por_pagina = int(req.get("por_pagina", 100))
        for pagina in range(1, int(req.get("paginas_max", 100)) + 1):
            try:
                r = self.cliente.get(req["url"], params={
                    "per_page": por_pagina, "page": pagina, "orderby": "modified", "order": "desc",
                    "_fields": "id,modified,link,title",
                })
                itens = r.json()
            except Exception as e:
                # o WordPress responde 400 quando a página passa da última: é o fim normal da lista
                if pagina > 1 and "400" in str(e):
                    return
                raise ErroDeFonte(f"Lista REST página {pagina}: {e}") from e
            if not isinstance(itens, list) or not itens:
                return
            yield from itens
            if len(itens) < por_pagina:
                return

    # ---------------------------------------------------------------- detalhe

    def _ler_detalhe(self, link: str, titulo: str) -> dict[str, Any]:
        pagina = BeautifulSoup(self.cliente.get(link).text, "lxml")
        campos = Extrator(pagina, url=link).campos((self.fonte.get("detalhe") or {}).get("campos") or {})
        campos = {k: v for k, v in campos.items() if v not in (None, "", [])}
        campos.setdefault("titulo", titulo)
        return campos

    def coletar(self) -> Iterator[LoteBruto]:
        vistos: set[str] = set()
        lidos = 0
        limite = int(self.fonte.get("max_detalhes_por_execucao", 3000))
        for item in self._itens():
            link, versao = item.get("link"), str(item.get("modified") or "")
            if not link or link in vistos:
                continue
            vistos.add(link)
            titulo = html.unescape((item.get("title") or {}).get("rendered") or "")
            sufixo = self.fonte.get("titulo_remove")
            if sufixo and titulo.endswith(sufixo):
                titulo = titulo[: -len(sufixo)]
            chave = "wp:" + link
            cache = self._ler_cache(chave)
            if cache and cache[0] == versao and versao:
                campos = cache[1]
            elif lidos >= limite and not cache:
                continue  # primeira carga grande: o resto entra nas próximas rodadas (sem esgotar o tempo da execução)
            else:
                try:
                    campos = self._ler_detalhe(link, titulo)
                except Exception as e:
                    self.registrar_erro(f"Detalhe {link}: {e}")
                    if cache:  # falhou agora: segue com o que já se sabia, para o lote não sumir
                        campos = cache[1]
                    else:
                        continue
                else:
                    lidos += 1
                    self._gravar_cache(chave, versao, campos)
            campos = dict(campos)
            campos.setdefault("id_externo", str(item.get("id")))
            lote = self.montar(campos, url=link)
            if lote:
                yield lote
