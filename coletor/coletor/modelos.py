"""Formato comum que todo adaptador devolve.

Um adaptador só precisa preencher o que a fonte tem. Tudo é opcional, menos `id_externo`.
A normalização (tipo, modalidade, valores, datas) acontece depois, em `normalizar.py`,
então o adaptador pode entregar texto cru ("R$ 1.234,56", "12/10/2026 às 14h").
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class LoteBruto(BaseModel):
    """Um lote como veio da fonte, antes de normalizar."""

    id_externo: str
    url: str | None = None
    titulo: str | None = None
    descricao: str | None = None

    # classificação (texto livre, normalizado depois)
    tipo: str | None = None
    modalidade: str | None = None
    status: str | None = None

    # localização
    uf: str | None = None
    cidade: str | None = None
    bairro: str | None = None
    endereco: str | None = None
    lat: float | None = None
    lon: float | None = None

    # características
    area_privativa: Any = None
    area_total: Any = None
    area_terreno: Any = None
    quartos: Any = None
    vagas: Any = None
    matricula: str | None = None
    cartorio: str | None = None

    # valores e datas (texto ou número)
    valor_avaliacao: Any = None
    lance_minimo: Any = None
    praca_atual: Any = None
    data_praca1: Any = None
    valor_praca1: Any = None
    data_praca2: Any = None
    valor_praca2: Any = None

    # condições
    ocupacao: str | None = None
    aceita_financiamento: Any = None
    aceita_fgts: Any = None
    aceita_parcelamento: Any = None
    debitos_por_conta: str | None = None  # quem paga IPTU/condomínio atrasados: vendedor | arrematante

    leiloeiro: str | None = None
    comitente: str | None = None   # quem vende: Caixa, Santander, Emgea, União...
    processo: str | None = None
    edital_url: str | None = None
    fotos: list[str] = Field(default_factory=list)
    dados: dict[str, Any] = Field(default_factory=dict)


class Lote(BaseModel):
    """Lote normalizado, pronto para gravar."""

    id_externo: str
    url: str | None = None
    titulo: str | None = None
    descricao: str | None = None
    tipo: str = "outros"
    modalidade: str = "outros"
    status: str = "ativo"

    uf: str | None = None
    cidade: str | None = None
    bairro: str | None = None
    endereco: str | None = None
    endereco_normalizado: str | None = None
    lat: float | None = None
    lon: float | None = None

    area_privativa: Decimal | None = None
    area_total: Decimal | None = None
    area_terreno: Decimal | None = None
    quartos: int | None = None
    vagas: int | None = None
    matricula: str | None = None
    cartorio: str | None = None

    valor_avaliacao: Decimal | None = None
    lance_minimo: Decimal | None = None
    praca_atual: int | None = None
    data_praca1: datetime | None = None
    valor_praca1: Decimal | None = None
    data_praca2: datetime | None = None
    valor_praca2: Decimal | None = None

    ocupacao: str = "nao_informado"
    aceita_financiamento: bool | None = None
    aceita_fgts: bool | None = None
    aceita_parcelamento: bool | None = None
    debitos_por_conta: str = "nao_informado"

    leiloeiro: str | None = None
    comitente: str | None = None
    processo: str | None = None
    edital_url: str | None = None
    fotos: list[str] = Field(default_factory=list)
    dados: dict[str, Any] = Field(default_factory=dict)
