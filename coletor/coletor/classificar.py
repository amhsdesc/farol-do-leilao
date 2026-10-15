"""Tags de classificação para investidor, calculadas SEM IA: airbnb, praia, turistico, universitario.

Regras (conservadoras: na dúvida, não marca):
  - praia: cidade litorânea da lista, bairro de orla em cidade grande, ou texto "frente mar / pé na areia / praia" no
    título, bairro ou endereço. Vale para apartamento, casa, terreno e comercial.
  - turistico: cidade de destino turístico da lista, ou texto como pousada/resort/temporada (apartamento, casa, terreno, comercial).
  - universitario: até 2 km de um campus com coordenada de endereço/rua e até 1,2 km com a do bairro (só quando a coordenada é do endereço, da rua ou do bairro, nunca do centro da
    cidade), ou texto "próximo à universidade/faculdade", ou bairro "Universitário". Só apartamento e casa.
  - airbnb: apartamento ou casa compacta (até 3 quartos e até 150 m², dados ausentes não excluem) que some 3 pontos ou
    mais: praia ou cidade turística (3), atrativo turístico até 1,5 km (3), hospital de referência até 1,5 km (2),
    centro de convenções até 2 km (2), polo de negócios até 1,2 km (2), universidade (1), texto de flat/temporada (2).
    Os fatores de distância só valem com coordenada de endereço, rua ou bairro (nunca do centro da cidade).
`classificar_imovel` é puro (sem banco). `Classificador.executar` lê os imóveis com lote ativo e grava a coluna `imovel.tags`.
"""
from __future__ import annotations

import json
import logging
import math
import re
from functools import lru_cache
from pathlib import Path

from . import referencia_tags as ref
from .normalizar import simplificar
from .referencia_osm import eh_instituicao

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


class _Indice:
    """Grade de 0,1° (~11 km) para achar o ponto mais próximo sem comparar com a lista inteira (a lista de campi pode ter milhares)."""

    CELULA = 0.1

    def __init__(self, pontos):
        self.celulas: dict[tuple[int, int], list[tuple[str, float, float]]] = {}
        for nome, la, lo in pontos:
            self.celulas.setdefault((math.floor(la / self.CELULA), math.floor(lo / self.CELULA)), []).append((nome, la, lo))

    def mais_proximo(self, lat: float, lon: float, raio_km: float) -> tuple[float, str] | None:
        ci, cj = math.floor(lat / self.CELULA), math.floor(lon / self.CELULA)
        melhor = None
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for nome, la, lo in self.celulas.get((ci + di, cj + dj), ()):
                    d = _km(lat, lon, la, lo)
                    if d <= raio_km and (melhor is None or d < melhor[0]):
                        melhor = (d, nome)
        return melhor


ARQUIVO_UNIVERSIDADES = Path(__file__).parent / "dados_ref" / "universidades.json"


def _universidades_osm() -> list[tuple[str, float, float]]:
    """Universidades do OpenStreetMap, se o arquivo foi gerado (`python -m coletor referencia-universidades`)."""
    try:
        bruto = json.loads(ARQUIVO_UNIVERSIDADES.read_text(encoding="utf-8"))
        # filtra aqui também: o arquivo gerado antes do filtro tem departamentos, laboratórios e prédios repetidos
        vistos: set[tuple[str, float, float]] = set()
        saida: list[tuple[str, float, float]] = []
        for n, la, lo in bruto:
            chave = (str(n).lower(), round(float(la), 2), round(float(lo), 2))
            if eh_instituicao(str(n)) and chave not in vistos:
                vistos.add(chave)
                saida.append((str(n), float(la), float(lo)))
        return saida
    except (OSError, ValueError, TypeError):
        return []


@lru_cache(maxsize=1)
def _indice_campi() -> _Indice:
    return _Indice(list(ref.CAMPI) + _universidades_osm())  # a lista curada vem primeiro: em empate vale o nome dela


@lru_cache(maxsize=None)
def _indice(nome: str) -> _Indice:
    return _Indice(getattr(ref, nome))


def campus_proximo(lat: float | None, lon: float | None, raio_km: float = ref.RAIO_CAMPUS_KM) -> str | None:
    if lat is None or lon is None:
        return None
    r = _indice_campi().mais_proximo(lat, lon, raio_km)
    return r[1] if r else None


def pontuar_airbnb(im: dict, tags: set[str], txt: str) -> tuple[int, list[str]]:
    """Pontos de demanda de temporada e os motivos (para conferir uma marcação)."""
    pontos, motivos = 0, []
    if "praia" in tags:
        pontos += 3
        motivos.append("praia")
    if "turistico" in tags:
        pontos += 3
        motivos.append("cidade turística")
    lat, lon = im.get("lat"), im.get("lon")
    if lat is not None and lon is not None and (im.get("geo_precisao") or "") in ("endereco", "rua", "bairro"):
        for lista, raio, peso, rotulo in (("ATRATIVOS", 1.5, 3, "atrativo"), ("HOSPITAIS", 1.5, 2, "hospital"),
                                           ("EVENTOS", 2.0, 2, "centro de convenções"), ("NEGOCIOS", 1.2, 2, "polo de negócios")):
            r = _indice(lista).mais_proximo(lat, lon, raio)
            if r:
                pontos += peso
                motivos.append(f"{rotulo}: {r[1]}")
    if "universitario" in tags:
        pontos += 1
        motivos.append("universidade")
    if _AIRBNB_TEXTO.search(txt):
        pontos += 2
        motivos.append("texto de flat/temporada")
    return pontos, motivos


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
        # coordenada de bairro é o centro do bairro, não o imóvel: raio menor para não marcar quem só mora perto
        raio = ref.RAIO_CAMPUS_KM if (im.get("geo_precisao") or "") in ("endereco", "rua") else ref.RAIO_CAMPUS_BAIRRO_KM
        if (precisa and campus_proximo(lat, lon, raio)) or _UNIV.search(txt) or _BAIRRO_UNIV.search(bairro):
            tags.add("universitario")

    # airbnb: residencial compacto que soma pontos de demanda de temporada
    if tipo in _RESIDENCIAL:
        quartos, area = im.get("quartos"), im.get("area")
        compacto = (quartos is None or quartos <= 3) and (area is None or float(area) <= 150)
        pontos, _ = pontuar_airbnb(im, tags, txt)
        texto_forte = bool(_AIRBNB_TEXTO.search(txt)) and bool({"praia", "turistico"} & tags)
        if pontos >= 3 and (compacto or texto_forte):
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
