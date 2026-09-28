"""Grava lotes no banco preservando o histórico e ligando cada lote à ficha única do imóvel."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from decimal import Decimal
from datetime import datetime
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from . import dedup
from .modelos import Lote

CAMPOS_LOTE = [
    "url", "titulo", "descricao", "modalidade", "status", "valor_avaliacao", "lance_minimo",
    "praca_atual", "data_praca1", "valor_praca1", "data_praca2", "valor_praca2", "ocupacao",
    "aceita_financiamento", "aceita_fgts", "leiloeiro", "processo", "edital_url", "fotos",
]
CAMPOS_IMOVEL = [
    "tipo", "uf", "cidade", "bairro", "endereco", "endereco_normalizado", "area_privativa",
    "area_total", "area_terreno", "quartos", "vagas", "matricula", "cartorio",
]
PROPORCAO_MINIMA_PARA_REMOVER = 0.5


def _json_padrao(v: Any) -> Any:
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    raise TypeError(type(v))


def snapshot(lote: Lote) -> dict[str, Any]:
    return json.loads(json.dumps(lote.model_dump(), default=_json_padrao))


def hash_lote(lote: Lote) -> str:
    """Hash do conteúdo relevante. `dados` fica de fora (campos voláteis como visualizações)."""
    d = snapshot(lote)
    d.pop("dados", None)
    return hashlib.sha1(json.dumps(d, sort_keys=True).encode()).hexdigest()


@dataclass
class Contadores:
    lidos: int = 0
    novos: int = 0
    alterados: int = 0
    iguais: int = 0
    removidos: int = 0
    erros: int = 0
    vistos: set[int] = field(default_factory=set)


class Repositorio:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    # ------------------------------------------------------------ fontes

    def sincronizar_fonte(self, f: dict[str, Any]) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into fonte (id, nome, site, tipo_adaptador, plataforma, uf, ativa, config)
                values (%(id)s, %(nome)s, %(site)s, %(tipo)s, %(plataforma)s, %(uf)s, %(ativa)s, %(config)s)
                on conflict (id) do update set
                    nome = excluded.nome, site = excluded.site, tipo_adaptador = excluded.tipo_adaptador,
                    plataforma = excluded.plataforma, uf = excluded.uf, ativa = excluded.ativa,
                    config = excluded.config, atualizado_em = now()
                """,
                {
                    "id": f["id"], "nome": f.get("nome", f["id"]), "site": f.get("site"),
                    "tipo": f["tipo"], "plataforma": f.get("plataforma"), "uf": f.get("uf", []),
                    "ativa": f.get("ativa", True), "config": Jsonb(f),
                },
            )
        self.conn.commit()

    # ------------------------------------------------------------ execuções

    def iniciar_execucao(self, fonte_id: str) -> int:
        with self.conn.cursor() as cur:
            cur.execute("insert into execucao_coleta (fonte_id) values (%s) returning id", (fonte_id,))
            eid = cur.fetchone()["id"]
        self.conn.commit()
        return eid

    def ativos(self, fonte_id: str) -> int:
        with self.conn.cursor() as cur:
            cur.execute("select count(*) n from lote where fonte_id = %s and status in ('ativo','suspenso')", (fonte_id,))
            return cur.fetchone()["n"]

    def finalizar_execucao(
        self, execucao_id: int, fonte_id: str, c: Contadores, ativos_antes: int,
        concluida: bool, mensagem: str | None = None,
    ) -> str:
        """Fecha a execução. Só marca lotes como removidos se a leitura foi completa e plausível."""
        status = "ok" if concluida and c.erros == 0 else ("parcial" if concluida else "erro")
        # remoção só com leitura limpa e completa: sem erros e com volume plausível
        pode_remover = (
            status == "ok" and c.lidos > 0 and c.lidos >= PROPORCAO_MINIMA_PARA_REMOVER * ativos_antes
        )
        if status == "ok" and not pode_remover and ativos_antes:
            status = "parcial"
            mensagem = (mensagem or "") + (
                f" Leu {c.lidos} de {ativos_antes} lotes ativos: remoções não aplicadas (possível coletor quebrado)."
            )
        with self.conn.cursor() as cur:
            if pode_remover:
                cur.execute(
                    """
                    select id, hash_conteudo from lote
                    where fonte_id = %s and status in ('ativo','suspenso') and not (id = any(%s))
                    """,
                    (fonte_id, list(c.vistos)),
                )
                for r in cur.fetchall():
                    cur.execute("update lote set status = 'removido' where id = %s", (r["id"],))
                    cur.execute(
                        """insert into leitura (lote_id, execucao_id, evento, hash_conteudo, status, snapshot)
                           values (%s, %s, 'removido', %s, 'removido', '{}'::jsonb)""",
                        (r["id"], execucao_id, r["hash_conteudo"]),
                    )
                    c.removidos += 1
            cur.execute(
                """
                update execucao_coleta set finalizada_em = now(), status = %s, lotes_lidos = %s,
                    lotes_novos = %s, lotes_alterados = %s, lotes_removidos = %s, erros = %s, mensagem = %s
                where id = %s
                """,
                (status, c.lidos, c.novos, c.alterados, c.removidos, c.erros, (mensagem or "").strip() or None, execucao_id),
            )
        self.conn.commit()
        return status

    # ------------------------------------------------------------ imóvel

    def _resolver_imovel(self, cur, lote: Lote, fonte_id: str, imovel_atual: int | None) -> int:
        ks = dedup.chaves(lote, fonte_id)
        imovel_id = imovel_atual
        if imovel_id is None:
            cur.execute(
                """select imovel_id from imovel_chave where chave = any(%s)
                   order by array_position(%s, chave) limit 1""",
                (ks, ks),
            )
            r = cur.fetchone()
            imovel_id = r["imovel_id"] if r else None
        valores = {c: getattr(lote, c) for c in CAMPOS_IMOVEL}
        if imovel_id is None:
            cur.execute(
                f"""insert into imovel ({', '.join(CAMPOS_IMOVEL)}, geom, geo_precisao, geo_fonte)
                    values ({', '.join('%(' + c + ')s' for c in CAMPOS_IMOVEL)},
                            case when %(lat)s::float8 is null then null
                                 else st_setsrid(st_makepoint(%(lon)s::float8, %(lat)s::float8), 4326)::geography end,
                            case when %(lat)s::float8 is null then null else 'fonte' end,
                            case when %(lat)s::float8 is null then null else %(fonte)s end)
                    returning id""",
                {**valores, "lat": lote.lat, "lon": lote.lon, "fonte": fonte_id},
            )
            imovel_id = cur.fetchone()["id"]
        else:
            # completa o que falta, sem sobrescrever o que já se sabe
            sets = ", ".join(f"{c} = coalesce({c}, %({c})s)" for c in CAMPOS_IMOVEL)
            cur.execute(
                f"""update imovel set {sets},
                        geom = coalesce(geom, case when %(lat)s::float8 is null then null
                            else st_setsrid(st_makepoint(%(lon)s::float8, %(lat)s::float8), 4326)::geography end),
                        geo_precisao = coalesce(geo_precisao, case when %(lat)s::float8 is null then null else 'fonte' end),
                        atualizado_em = now()
                    where id = %(id)s""",
                {**valores, "lat": lote.lat, "lon": lote.lon, "id": imovel_id},
            )
        for k in ks:
            cur.execute(
                "insert into imovel_chave (chave, imovel_id) values (%s, %s) on conflict do nothing",
                (k, imovel_id),
            )
        return imovel_id

    # ------------------------------------------------------------ lote

    def gravar(self, fonte_id: str, lote: Lote, execucao_id: int, c: Contadores) -> str:
        """Insere ou atualiza o lote. Grava leitura só quando algo mudou. Devolve o evento."""
        h = hash_lote(lote)
        snap = snapshot(lote)
        with self.conn.cursor() as cur:
            cur.execute(
                "select id, hash_conteudo, status, imovel_id from lote where fonte_id = %s and id_externo = %s",
                (fonte_id, lote.id_externo),
            )
            atual = cur.fetchone()
            imovel_id = self._resolver_imovel(cur, lote, fonte_id, atual["imovel_id"] if atual else None)
            valores = {c_: getattr(lote, c_) for c_ in CAMPOS_LOTE}
            valores.update(dados=Jsonb(lote.dados), hash=h, imovel_id=imovel_id)

            if atual is None:
                cur.execute(
                    f"""insert into lote (fonte_id, id_externo, imovel_id, {', '.join(CAMPOS_LOTE)}, dados, hash_conteudo)
                        values (%(fonte)s, %(idx)s, %(imovel_id)s, {', '.join('%(' + x + ')s' for x in CAMPOS_LOTE)},
                                %(dados)s, %(hash)s)
                        returning id""",
                    {**valores, "fonte": fonte_id, "idx": lote.id_externo},
                )
                lote_id, evento = cur.fetchone()["id"], "novo"
                c.novos += 1
            else:
                lote_id = atual["id"]
                reapareceu = atual["status"] == "removido"
                mudou = atual["hash_conteudo"] != h
                sets = ", ".join(f"{x} = %({x})s" for x in CAMPOS_LOTE)
                cur.execute(
                    f"""update lote set {sets}, dados = %(dados)s, hash_conteudo = %(hash)s,
                            imovel_id = %(imovel_id)s, ultimo_visto_em = now()
                        where id = %(lote_id)s""",
                    {**valores, "lote_id": lote_id},
                )
                evento = "reaparecido" if reapareceu else ("alterado" if mudou else "igual")
                if evento == "igual":
                    c.iguais += 1
                else:
                    c.alterados += 1

            if evento != "igual":
                cur.execute(
                    """insert into leitura (lote_id, execucao_id, evento, hash_conteudo, status, lance_minimo, praca_atual, snapshot)
                       values (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (lote_id, execucao_id, evento, h, lote.status, lote.lance_minimo, lote.praca_atual, Jsonb(snap)),
                )
        self.conn.commit()
        c.lidos += 1
        c.vistos.add(lote_id)
        return evento
