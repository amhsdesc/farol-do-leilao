"""Executa a coleta de uma fonte: adaptador → normalização → gravação com histórico."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from .adaptadores import TIPOS, ErroDeFonte
from .config import config
from .http import Cliente
from .normalizar import normalizar
from .repositorio import Contadores, Repositorio

log = logging.getLogger(__name__)


@dataclass
class Resultado:
    fonte_id: str
    status: str
    contadores: Contadores
    segundos: float
    mensagem: str | None


def executar(fonte: dict[str, Any], conn, cliente: Cliente | None = None, **kw_adaptador) -> Resultado:
    repo = Repositorio(conn)
    repo.sincronizar_fonte(fonte)
    fonte_id = fonte["id"]
    classe = TIPOS.get(fonte["tipo"])
    if not classe:
        raise ValueError(f"Tipo de adaptador desconhecido: {fonte['tipo']} (disponíveis: {', '.join(TIPOS)})")

    proprio = cliente is None
    if proprio:
        brutos = config.pasta_dados / "brutos" / fonte_id if fonte.get("salvar_brutos") else None
        cliente = Cliente(
            intervalo=fonte.get("intervalo_segundos"),
            salvar_brutos_em=brutos,
            cabecalhos=fonte.get("cabecalhos"),
            verificar_tls=fonte.get("verificar_tls", True),
        )

    execucao_id = repo.iniciar_execucao(fonte_id)
    ativos_antes = repo.ativos(fonte_id)
    c = Contadores()
    adaptador = classe(fonte, cliente, conn=conn, **kw_adaptador)
    inicio = time.monotonic()
    concluida, mensagem = False, None
    try:
        for bruto in adaptador.coletar():
            try:
                lote = normalizar(bruto, adaptador.padroes)
                repo.gravar(fonte_id, lote, execucao_id, c)
            except Exception as e:  # um lote ruim não derruba a fonte
                conn.rollback()
                adaptador.registrar_erro(f"Lote {getattr(bruto, 'id_externo', '?')}: {e}")
        concluida = True
    except ErroDeFonte as e:
        mensagem = str(e)
        conn.rollback()
    except Exception as e:
        log.exception("Falha na fonte %s", fonte_id)
        mensagem = f"{type(e).__name__}: {e}"
        conn.rollback()
    finally:
        if proprio:
            cliente.fechar()

    c.erros += len(adaptador.erros)
    if adaptador.erros:
        amostra = "; ".join(adaptador.erros[:5])
        mensagem = f"{mensagem + ' | ' if mensagem else ''}{len(adaptador.erros)} aviso(s): {amostra}"
    status = repo.finalizar_execucao(execucao_id, fonte_id, c, ativos_antes, concluida, mensagem)
    return Resultado(fonte_id, status, c, time.monotonic() - inicio, mensagem)
