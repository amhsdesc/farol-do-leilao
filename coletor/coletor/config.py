"""Configuração por variáveis de ambiente (arquivo .env na raiz do projeto)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[2]          # pasta do projeto/
PASTA_COLETOR = Path(__file__).resolve().parents[1]  # pasta do projeto/coletor
load_dotenv(RAIZ / ".env")


@dataclass(frozen=True)
class Config:
    database_url: str = os.getenv("DATABASE_URL", "postgresql://farol:farol@localhost:5432/farol")
    contato: str = os.getenv("CONTATO_EMAIL", "contato@exemplo.com")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
    modelo_llm: str = os.getenv("MODELO_LLM", "claude-haiku-4-5-20251001")
    intervalo_minimo: float = float(os.getenv("INTERVALO_MINIMO_SEGUNDOS", "2"))
    respeitar_robots: bool = os.getenv("RESPEITAR_ROBOTS", "1") != "0"
    pasta_fontes: Path = Path(os.getenv("PASTA_FONTES", str(PASTA_COLETOR / "fontes")))
    pasta_dados: Path = Path(os.getenv("PASTA_DADOS", str(RAIZ / "dados")))
    llm_max_paginas_por_execucao: int = int(os.getenv("LLM_MAX_PAGINAS_POR_EXECUCAO", "200"))
    # Teto GLOBAL por dia (todas as fontes juntas). O valor em uso fica na tabela llm_orcamento (dá para mudar no banco);
    # este é só o padrão, caso a tabela esteja vazia.
    llm_max_chamadas_dia: int = int(os.getenv("LLM_MAX_CHAMADAS_DIA") or "1000")

    @property
    def user_agent(self) -> str:
        return f"FarolDoLeilaoBot/0.1 (+agregador de leiloes; contato: {self.contato})"


config = Config()
