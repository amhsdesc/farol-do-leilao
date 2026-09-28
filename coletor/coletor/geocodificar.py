"""Põe no mapa os imóveis sem coordenada, usando Nominatim (OpenStreetMap) com cache.

Tenta do mais preciso ao menos preciso: endereço completo → bairro → cidade, e grava a precisão obtida.
Respeita o limite de 1 requisição por segundo do Nominatim público. Para volume grande, troque
NOMINATIM_URL por uma instância própria ou outro provedor.
"""
from __future__ import annotations

import logging
import os
import re
import time

import httpx
from psycopg.types.json import Jsonb

from .config import config

log = logging.getLogger(__name__)
NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")


def _limpar_endereco(endereco: str | None) -> str | None:
    if not endereco:
        return None
    # tira complemento que atrapalha a busca (apto, bloco, casa, CEP)
    e = re.split(r"\b(apto?\.?|apartamento|bl(oco)?\.?|casa\s*\d|sala|loja|cep)\b", endereco, flags=re.I)[0]
    return e.strip(" ,-") or None


def consultas(im: dict) -> list[tuple[str, str]]:
    cidade, uf = im.get("cidade"), im.get("uf")
    if not cidade or not uf:
        return []
    base = f"{cidade}, {uf}, Brasil"
    out = []
    end = _limpar_endereco(im.get("endereco"))
    if end:
        out.append((f"{end}, {im.get('bairro') + ', ' if im.get('bairro') else ''}{base}", "endereco"))
    if im.get("bairro"):
        out.append((f"{im['bairro']}, {base}", "bairro"))
    out.append((base, "cidade"))
    return out


class Geocodificador:
    def __init__(self, conn, transport: httpx.BaseTransport | None = None, intervalo: float = 1.1):
        self.conn = conn
        self.intervalo = intervalo
        self.http = httpx.Client(headers={"User-Agent": config.user_agent}, timeout=30, transport=transport)
        self._ultimo = 0.0

    def _buscar(self, consulta: str) -> tuple[float, float, dict] | None:
        with self.conn.cursor() as cur:
            cur.execute("select lat, lon, resposta from geocache where consulta = %s", (consulta,))
            r = cur.fetchone()
        if r:
            return (r["lat"], r["lon"], r["resposta"]) if r["lat"] is not None else None
        espera = self.intervalo - (time.monotonic() - self._ultimo)
        if espera > 0:
            time.sleep(espera)
        self._ultimo = time.monotonic()
        resp = self.http.get(NOMINATIM_URL, params={"q": consulta, "format": "jsonv2", "countrycodes": "br", "limit": 1})
        resp.raise_for_status()
        dados = resp.json()
        achado = dados[0] if dados else None
        with self.conn.cursor() as cur:
            cur.execute(
                """insert into geocache (consulta, lat, lon, precisao, fonte, resposta) values (%s, %s, %s, %s, 'nominatim', %s)
                   on conflict (consulta) do nothing""",
                (consulta, float(achado["lat"]) if achado else None, float(achado["lon"]) if achado else None,
                 achado.get("type") if achado else None, Jsonb(achado or {})),
            )
        self.conn.commit()
        return (float(achado["lat"]), float(achado["lon"]), achado) if achado else None

    def pendentes(self, limite: int) -> list[dict]:
        with self.conn.cursor() as cur:
            cur.execute(
                """select i.id, i.endereco, i.bairro, i.cidade, i.uf from imovel i
                   where i.geom is null and i.cidade is not null
                     and exists (select 1 from lote l where l.imovel_id = i.id and l.status in ('ativo','suspenso'))
                   order by i.id limit %s""",
                (limite,),
            )
            return cur.fetchall()

    def executar(self, limite: int = 500) -> dict[str, int]:
        cont = {"endereco": 0, "bairro": 0, "cidade": 0, "falhou": 0}
        for im in self.pendentes(limite):
            achou = False
            for consulta, precisao in consultas(im):
                try:
                    r = self._buscar(consulta)
                except httpx.HTTPError as e:
                    log.warning("Geocodificação falhou (%s): %s", consulta, e)
                    r = None
                if r:
                    lat, lon, _ = r
                    with self.conn.cursor() as cur:
                        cur.execute(
                            """update imovel set geom = st_setsrid(st_makepoint(%s, %s), 4326)::geography,
                               geo_precisao = %s, geo_fonte = 'nominatim', atualizado_em = now() where id = %s""",
                            (lon, lat, precisao, im["id"]),
                        )
                    self.conn.commit()
                    cont[precisao] += 1
                    achou = True
                    break
            if not achou:
                cont["falhou"] += 1
        return cont
