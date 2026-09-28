"""Mini-linguagem para descrever, no YAML, onde está cada campo numa página ou num JSON.

Formas aceitas para um campo:

    titulo: "h1"                          # texto do primeiro elemento que casa com o seletor CSS
    url_foto: "img.principal@src"         # atributo (href/src viram URL absoluta)
    fotos: {css: ".galeria img", attr: src, todos: true}
    valor_avaliacao: {rotulo: "Avaliação"}            # texto logo depois do rótulo na página
    data_praca1: {texto_regex: "1[ºo] Leil[aã]o:?\\s*([\\d/]+ [\\d:h]+)"}   # grupo 1 no texto da página
    id_externo: {url_regex: "/lote/(\\d+)"}           # grupo 1 na URL
    uf: {fixo: "DF"}                                  # valor constante
    lance_minimo: {json: "valores.lanceInicial"}       # caminho num objeto JSON (json_api)
    cidade: {css: ".local", regex: "^(.*?)\\s*/"}     # seletor + regex aplicado ao texto

Qualquer forma aceita também `regex` (aplicado ao resultado) e `padrao` (valor se vazio).
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag


def caminho_json(obj: Any, caminho: str) -> Any:
    """'a.b[0].c' em dicts/listas. Devolve None se não existir."""
    atual = obj
    for parte in re.findall(r"[^.\[\]]+|\[\d+\]", caminho):
        if atual is None:
            return None
        if parte.startswith("["):
            i = int(parte[1:-1])
            atual = atual[i] if isinstance(atual, list) and len(atual) > i else None
        elif isinstance(atual, dict):
            atual = atual.get(parte)
        else:
            return None
    return atual


def texto_de(el: Tag) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


class Extrator:
    def __init__(self, contexto: Tag | BeautifulSoup | dict | list | None, url: str = "", pagina: BeautifulSoup | None = None):
        self.contexto = contexto
        self.url = url
        self.pagina = pagina if pagina is not None else (contexto if isinstance(contexto, BeautifulSoup) else None)
        self._texto_pagina: str | None = None

    @property
    def texto_pagina(self) -> str:
        if self._texto_pagina is None:
            base = self.pagina if self.pagina is not None else self.contexto
            self._texto_pagina = texto_de(base) if isinstance(base, Tag) else ""
        return self._texto_pagina

    def _absoluta(self, valor: str) -> str:
        return urljoin(self.url, valor) if self.url and valor and not valor.startswith(("data:", "javascript:")) else valor

    def _css(self, seletor: str, attr: str | None, todos: bool) -> Any:
        if not isinstance(self.contexto, Tag):
            return None
        els = self.contexto.select(seletor) if todos else [self.contexto.select_one(seletor)]
        valores = []
        for el in els:
            if el is None:
                continue
            if attr:
                v = el.get(attr)
                if isinstance(v, list):
                    v = " ".join(v)
                if v and attr in {"href", "src", "data-src", "data-href", "data-original"}:
                    v = self._absoluta(v)
            else:
                v = texto_de(el)
            if v:
                valores.append(v)
        return valores if todos else (valores[0] if valores else None)

    def _rotulo(self, rotulo: str) -> str | None:
        """Valor que acompanha um rótulo: '<li>Endereço: X</li>', '<dt>Endereço</dt><dd>X</dd>',
        '<li><b>Endereço:</b> X</li>'. Usa a estrutura do HTML para não engolir o campo seguinte."""
        from ..normalizar import simplificar

        base = self.pagina if self.pagina is not None else self.contexto
        if not isinstance(base, Tag):
            return None
        alvo = simplificar(rotulo)

        def sem_rotulo(texto: str) -> str:
            if simplificar(texto[: len(rotulo)]) == alvo:
                texto = texto[len(rotulo):]
            return texto.lstrip(" :-– ").strip()

        for no in base.find_all(string=True):
            if not simplificar(no).startswith(alvo):
                continue
            pai = no.parent
            for el in (pai, pai.parent):
                if el is None:
                    continue
                resto = sem_rotulo(texto_de(el))
                if resto and len(resto) <= 200:
                    return resto
            irmao = pai.find_next_sibling()
            if irmao is not None and texto_de(irmao):
                return texto_de(irmao)
        # último recurso: texto corrido da página, até 120 caracteres
        m = re.search(rf"{re.escape(rotulo)}\s*:?\s*(.{{1,120}}?)(?:\s{{2,}}|$)", self.texto_pagina, re.IGNORECASE)
        return m.group(1).strip() if m else None

    def campo(self, spec: Any) -> Any:
        if spec is None:
            return None
        if isinstance(spec, str):
            seletor, _, attr = spec.partition("@")
            return self._css(seletor.strip(), attr.strip() or None, False)
        if not isinstance(spec, dict):
            return spec

        valor: Any = None
        if "fixo" in spec:
            valor = spec["fixo"]
        elif "json" in spec:
            valor = caminho_json(self.contexto, spec["json"])
        elif "css" in spec:
            valor = self._css(spec["css"], spec.get("attr"), bool(spec.get("todos")))
        elif "rotulo" in spec:
            rotulos = spec["rotulo"] if isinstance(spec["rotulo"], list) else [spec["rotulo"]]
            valor = next((v for r in rotulos if (v := self._rotulo(r))), None)
        elif "texto_regex" in spec:
            m = re.search(spec["texto_regex"], self.texto_pagina, re.IGNORECASE)
            valor = (m.group(1) if m.groups() else m.group(0)) if m else None
        elif "url_regex" in spec:
            m = re.search(spec["url_regex"], self.url)
            valor = (m.group(1) if m.groups() else m.group(0)) if m else None

        if valor is not None and "regex" in spec:
            def aplicar(v: Any) -> Any:
                m = re.search(spec["regex"], str(v), re.IGNORECASE)
                return (m.group(1) if m.groups() else m.group(0)) if m else None
            valor = [x for x in map(aplicar, valor) if x] if isinstance(valor, list) else aplicar(valor)
        if isinstance(valor, list) and spec.get("junta") is not None:
            valor = spec["junta"].join(map(str, valor))
        if valor in (None, "", []) and "padrao" in spec:
            valor = spec["padrao"]
        return valor

    def campos(self, specs: dict[str, Any]) -> dict[str, Any]:
        return {nome: self.campo(spec) for nome, spec in (specs or {}).items()}
