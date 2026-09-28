"""Adaptador genérico por seletores CSS descritos no YAML. Serve para a maioria dos sites de leiloeiros.

Configuração:
    tipo: seletores
    navegador: false                      # true se a listagem só aparece com JavaScript
    listagem:
      url: https://www.site.com.br/imoveis?pagina={pagina}   # sem {pagina} = página única
      pagina_inicial: 1
      paginas_max: 30
      item: "div.card-lote"               # cada lote na listagem
      link: "a.detalhes@href"             # link do lote (opcional; sem ele, lê tudo do card)
      campos: {...}                       # campos lidos direto do card (opcional)
    detalhe:
      esperar_seletor: "h1"               # só com navegador
      campos: {...}                       # campos lidos na página do lote

Os campos usam a mini-linguagem de `extracao.py`.
"""
from __future__ import annotations

from typing import Any, Iterator

from bs4 import BeautifulSoup

from ..modelos import LoteBruto
from .base import Adaptador, ErroDeFonte
from .extracao import Extrator


class Seletores(Adaptador):
    tipo = "seletores"

    def _html(self, url: str, esperar: str | None = None) -> BeautifulSoup:
        if self.fonte.get("navegador"):
            html = self.cliente.html_navegador(url, esperar_seletor=esperar)
        else:
            html = self.cliente.get(url).text
        return BeautifulSoup(html, "lxml")

    def _urls_listagem(self) -> Iterator[str]:
        lst = self.fonte.get("listagem") or {}
        modelo = lst.get("url")
        if not modelo:
            raise ErroDeFonte("Informe listagem.url no YAML.")
        urls = modelo if isinstance(modelo, list) else [modelo]
        for u in urls:
            if "{pagina}" not in u:
                yield u
                continue
            inicio = int(lst.get("pagina_inicial", 1))
            for p in range(inicio, inicio + int(lst.get("paginas_max", 30))):
                yield u.format(pagina=p)

    def coletar(self) -> Iterator[LoteBruto]:
        lst = self.fonte.get("listagem") or {}
        det = self.fonte.get("detalhe") or {}
        vistos: set[str] = set()
        for url_lista in self._urls_listagem():
            try:
                pagina = self._html(url_lista, lst.get("esperar_seletor"))
            except Exception as e:
                self.registrar_erro(f"Listagem {url_lista}: {e}")
                break
            itens = pagina.select(lst["item"]) if lst.get("item") else []
            novos = 0
            for item in itens:
                ex = Extrator(item, url=url_lista, pagina=pagina)
                campos: dict[str, Any] = ex.campos(lst.get("campos") or {})
                link = ex.campo(lst["link"]) if lst.get("link") else None
                chave = link or campos.get("id_externo") or str(item)[:200]
                if chave in vistos:
                    continue
                vistos.add(chave)
                novos += 1
                if link and det.get("campos"):
                    try:
                        dp = self._html(link, det.get("esperar_seletor"))
                        campos.update({k: v for k, v in Extrator(dp, url=link).campos(det["campos"]).items()
                                       if v not in (None, "", [])})
                    except Exception as e:
                        self.registrar_erro(f"Detalhe {link}: {e}")
                        continue
                lote = self.montar(campos, url=link)
                if lote:
                    yield lote
            if novos == 0:  # página vazia ou repetida: fim da paginação
                break
