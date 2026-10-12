"""Tags de classificação para investidor, calculadas SEM IA: airbnb, praia, turistico, universitario.

Regras (conservadoras: na dúvida, não marca):
  - praia: cidade litorânea da lista, bairro de orla em cidade grande, ou texto "frente mar / pé na areia / praia" no
    título, bairro ou endereço. Vale para apartamento, casa, terreno e comercial.
  - turistico: cidade de destino turístico da lista, ou texto como pousada/resort/temporada (apartamento, casa, terreno, comercial).
  - universitario: até 2,5 km de um campus (só quando a coordenada é do endereço, da rua ou do bairro, nunca do centro da
    cidade), ou texto "próximo à universidade/faculdade", ou bairro "Universitário". Só apartamento e casa.
  - airbnb: apartamento ou casa compacta (até 3 quartos e até 150 m², dados ausentes não excluem) em lugar de praia ou
    turístico, ou texto "flat/studio/temporada/airbnb" nesses lugares.
`classificar_imovel` é puro (sem banco). `Classificador.executar` lê os imóveis com lote ativo e grava a coluna `imovel.tags`.
"""
from __future__ import annotations

import logging
import math
import re

from . import referencia_tags as ref
from .normalizar import simplificar

log = logging.getLogger(__name__)

TAGS = ("airbnb", "praia", "turistico", "universitario")
_RESIDENCIAL = {"apartamento", "casa"}
_INVESTIVEL = {"apartamento", "casa", "terreno", "comercial"}

_FORTE = re.compile(ref.TEXTO_PRAIA_FORTE)
_LOCAL = re.compile(ref.TEXTO_PRAIA_LOCAL)
_TURISTICO = re.compile(ref.TEXTO_TURISTICO)
_UNIV = re.compile(ref.TEXTO_UNIVERSITARIO)
_BAIRRO_UNIV = re.compile(ref.BAIRRO_UNIVERSITARIO)
_AIRBNB_TEXTO = re.compile(r"\b(flat|studio|kitnet|loft|temporada|airbnb)\b")
# "sem acesso à praia", "longe do mar" não podem marcar praia
_NEGA = re.compile(r"\b(sem|nao tem|longe d[aoe]|distante d[aoe])\s+(?:acesso\s+)?(?:a\s+|ao\s+|da\s+|do\s+)?(?:praia|mar)\b")


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def campus_proximo(lat: float | None, lon: float | None, raio_km: float = ref.RAIO_CAMPUS_KM) -> str | None:
    if lat is None or lon is None:
        return None
    melhor = min(((_km(lat, lon, la, lo), nome) for nome, la, lo in ref.CAMPI), default=None)
    return melhor[1] if melhor and melhor[0] <= raio_km else None


def classificar_imovel(im: dict, texto: str = "") -> list[str]:
    """`im`: tipo, uf, cidade, bairro, endereco, quartos, area, lat, lon, geo_precisao. `texto`: títulos/descrições dos lotes."""
    tipo = (im.get("tipo") or "").lower()
    if tipo not in _INVESTIVEL:
        return []
    uf = (im.get("uf") or "").strip().upper()
    cidade = simplificar(im.get("cidade"))
    bairro = simplificar(im.get("bairro"))
    local = f"{simplificar(im.get('endereco'))} {bairro}".strip()
    txt = simplificar(texto)[:6000]
    tags: set[str] = set()

    # praia
    praia = (cidade, uf) in ref.CIDADES_PRAIA or bairro in ref.BAIRROS_PRAIA.get((cidade, uf), set())
    if not praia and not _NEGA.search(txt):
        praia = bool(_FORTE.search(txt) or _FORTE.search(local))
    if not praia:
        praia = bool(_LOCAL.search(f"{bairro} {simplificar(im.get('endereco'))}"))
    if praia:
        tags.add("praia")

    # turístico
    if (cidade, uf) in ref.CIDADES_TURISTICAS or _TURISTICO.search(txt[:1500]):
        tags.add("turistico")

    # universitário (apartamento e casa)
    if tipo in _RESIDENCIAL:
        precisa = (im.get("geo_precisao") or "") in ("endereco", "rua", "bairro")
        lat, lon = im.get("lat"), im.get("lon")
        if (precisa and campus_proximo(lat, lon)) or _UNIV.search(txt) or _BAIRRO_UNIV.search(bairro):
            tags.add("universitario")

    # airbnb: residencial compacto onde há demanda de temporada
    if tipo in _RESIDENCIAL and ({"praia", "turistico"} & tags):
        quartos, area = im.get("quartos"), im.get("area")
        compacto = (quartos is None or quartos <= 3) and (area is None or float(area) <= 150)
        if compacto or _AIRBNB_TEXTO.search(txt):
            tags.add("airbnb")
    return [t for t in TAGS if t in tags]


class Classificador:
    def __init__(self, conn):
        self.conn = conn

    def executar(self, limite: int | None = None) -> dict[str, int]:
        """Recalcula as tags de todos os imóveis com lote ativo (barato: regras em memória) e grava só o que mudou."""
        with self.conn.cursor() as cur:
            cur.execute(
                """select i.id, i.tipo, i.uf, i.cidade, i.bairro, i.endereco, i.quartos,
                          coalesce(i.area_privativa, i.area_total, i.area_terreno) as area,
                          st_y(i.geom::geometry) as lat, st_x(i.geom::geometry) as lon, i.geo_precisao, i.tags,
                          (select string_agg(coalesce(l.titulo, '') || ' ' || left(coalesce(l.descricao, ''), 1500), ' ')
                             from lote l where l.imovel_id = i.id and l.status in ('ativo', 'suspenso')) as texto
                   from imovel i
                   where exists (select 1 from lote l where l.imovel_id = i.id and l.status in ('ativo', 'suspenso'))
                   order by i.id""" + (f" limit {int(limite)}" if limite else ""))
            linhas = cur.fetchall()
        mudancas, contagem = [], {t: 0 for t in TAGS}
        for r in linhas:
            novas = classificar_imovel(r, r["texto"] or "")
            for t in novas:
                contagem[t] += 1
            if sorted(novas) != sorted(r["tags"] or []):
                mudancas.append((novas, r["id"]))
        with self.conn.cursor() as cur:
            cur.executemany("update imovel set tags = %s, tags_em = now() where id = %s", mudancas)
            if not limite:  # imóveis sem lote ativo não aparecem na busca: limpa para não sobrar tag velha
                cur.execute("""update imovel set tags = '{}', tags_em = now()
                               where tags <> '{}' and not exists
                                 (select 1 from lote l where l.imovel_id = imovel.id and l.status in ('ativo', 'suspenso'))""")
        self.conn.commit()
        return {"imoveis": len(linhas), "alterados": len(mudancas), **contagem}
