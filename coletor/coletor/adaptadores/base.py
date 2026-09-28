"""Contrato comum dos adaptadores."""
from __future__ import annotations

import hashlib
import logging
from typing import Any, Iterator

from ..http import Cliente
from ..modelos import LoteBruto

log = logging.getLogger(__name__)

CAMPOS_LOTE_BRUTO = set(LoteBruto.model_fields)


class ErroDeFonte(Exception):
    """Erro com mensagem que ajuda a consertar a fonte (vai para o log da execução)."""


class Adaptador:
    tipo: str = ""

    def __init__(self, fonte: dict[str, Any], cliente: Cliente, conn=None):
        self.fonte = fonte
        self.cliente = cliente
        self.conn = conn
        self.erros: list[str] = []

    @property
    def padroes(self) -> dict[str, Any]:
        """Valores usados quando a fonte não informa o campo (ex.: uf de um leiloeiro de um só estado)."""
        p = dict(self.fonte.get("padroes") or {})
        ufs = self.fonte.get("uf") or []
        if len(ufs) == 1:
            p.setdefault("uf", ufs[0])
        return p

    def coletar(self) -> Iterator[LoteBruto]:  # pragma: no cover
        raise NotImplementedError

    def registrar_erro(self, msg: str) -> None:
        log.warning("[%s] %s", self.fonte.get("id"), msg)
        self.erros.append(msg)

    @staticmethod
    def montar(campos: dict[str, Any], url: str | None = None) -> LoteBruto | None:
        """Cria LoteBruto a partir de um dict; campos desconhecidos vão para `dados`."""
        conhecidos = {k: v for k, v in campos.items() if k in CAMPOS_LOTE_BRUTO and v not in (None, "", [])}
        extras = {k: v for k, v in campos.items() if k not in CAMPOS_LOTE_BRUTO and v not in (None, "", [])}
        if url and not conhecidos.get("url"):
            conhecidos["url"] = url
        if not conhecidos.get("id_externo"):
            base = conhecidos.get("url")
            if not base:
                return None
            conhecidos["id_externo"] = "u" + hashlib.sha1(base.encode()).hexdigest()[:16]
        conhecidos["id_externo"] = str(conhecidos["id_externo"])
        fotos = conhecidos.get("fotos")
        if isinstance(fotos, str):
            conhecidos["fotos"] = [fotos]
        dados = {**(conhecidos.get("dados") or {}), **extras}
        conhecidos["dados"] = dados
        return LoteBruto(**conhecidos)
