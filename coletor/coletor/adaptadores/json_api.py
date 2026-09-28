"""Adaptador para sites que carregam os lotes por uma API JSON (o jeito mais estável de coletar).

Use `python -m coletor inspecionar URL` para descobrir o endpoint: ele lista as respostas JSON
que a página baixa ao abrir.

Configuração:
    tipo: json_api
    requisicao:
      url: https://api.site.com.br/lotes
      metodo: GET                       # ou POST
      params: {pagina: "{pagina}", tamanho: 50, categoria: imoveis}
      corpo: {...}                      # para POST (aceita {pagina})
      cabecalhos: {...}
      pagina_inicial: 1
      paginas_max: 100
    itens: "dados.lotes"                # caminho até a lista de lotes na resposta
    campos:
      id_externo: {json: id}
      titulo: {json: titulo}
      lance_minimo: {json: "valores.lanceInicial"}
    url_lote: "https://www.site.com.br/lote/{id}"   # opcional: monta a URL do lote com campos do item
"""
from __future__ import annotations

import json
from typing import Any, Iterator

from ..modelos import LoteBruto
from .base import Adaptador, ErroDeFonte
from .extracao import Extrator, caminho_json


def _substituir(obj: Any, pagina: int) -> Any:
    if isinstance(obj, str):
        return int(pagina) if obj == "{pagina}" else obj.replace("{pagina}", str(pagina))
    if isinstance(obj, dict):
        return {k: _substituir(v, pagina) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substituir(v, pagina) for v in obj]
    return obj


class _Formatador(dict):
    def __missing__(self, chave: str) -> str:
        return ""


class JsonApi(Adaptador):
    tipo = "json_api"

    def coletar(self) -> Iterator[LoteBruto]:
        req = self.fonte.get("requisicao") or {}
        if not req.get("url"):
            raise ErroDeFonte("Informe requisicao.url no YAML.")
        inicio = int(req.get("pagina_inicial", 1))
        paginado = "{pagina}" in json.dumps(req)
        vistos: set[str] = set()
        for pagina in range(inicio, inicio + (int(req.get("paginas_max", 100)) if paginado else 1)):
            try:
                r = self.cliente.requisitar(
                    req.get("metodo", "GET").upper(),
                    _substituir(req["url"], pagina),
                    params=_substituir(req.get("params"), pagina),
                    json=_substituir(req.get("corpo"), pagina),
                    headers=req.get("cabecalhos"),
                )
                dados = r.json()
            except Exception as e:
                self.registrar_erro(f"Página {pagina}: {e}")
                break
            itens = caminho_json(dados, self.fonte["itens"]) if self.fonte.get("itens") else dados
            if not isinstance(itens, list) or not itens:
                break
            novos = 0
            for item in itens:
                campos = Extrator(item).campos(self.fonte.get("campos") or {})
                if self.fonte.get("url_lote") and isinstance(item, dict):
                    campos.setdefault("url", self.fonte["url_lote"].format_map(_Formatador(item)))
                lote = self.montar(campos)
                if lote and lote.id_externo not in vistos:
                    vistos.add(lote.id_externo)
                    novos += 1
                    yield lote
            total = caminho_json(dados, self.fonte["total_paginas"]) if self.fonte.get("total_paginas") else None
            if novos == 0 or (total and pagina - inicio + 1 >= int(total)):
                break
