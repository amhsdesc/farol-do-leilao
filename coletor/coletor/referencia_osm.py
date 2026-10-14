"""Gera a lista de universidades do Brasil a partir do OpenStreetMap (Overpass), para a tag "universitário".

Roda uma vez (no seu computador) e o resultado fica no projeto: `coletor/dados_ref/universidades.json`, com
[nome, lat, lon]. Pega todo `amenity=university` com nome e as unidades (`amenity=college`) das grandes redes privadas
(Estácio, UNIP, Anhanguera, Uninove, Unopar, Unicesumar, Uninter etc.). Uma única consulta, identificada pelo User-Agent.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import httpx

from .config import config

OVERPASS = "https://overpass-api.de/api/interpreter"
REDES = "Estácio|Estacio|UNIP|Universidade Paulista|Anhanguera|Unopar|Uninove|Unicesumar|Uninter|Unisul|UniAsselvi|Uniasselvi|Unifacs|Uninassau|Unifor|Ulbra|Unisinos|FMU|Unesa|Univali|Mackenzie|PUC|Cruzeiro do Sul|São Judas|Unip"
CONSULTA = f"""[out:json][timeout:240];
area["ISO3166-1"="BR"][admin_level=2]->.br;
(
  nwr["amenity"="university"]["name"](area.br);
  nwr["amenity"="college"]["name"~"{REDES}"](area.br);
);
out center tags;"""


def filtrar(elementos: list[dict[str, Any]]) -> list[list[Any]]:
    """[nome, lat, lon] sem repetir o mesmo nome no mesmo quarteirão (~100 m)."""
    vistos: set[tuple[str, float, float]] = set()
    saida: list[list[Any]] = []
    for e in elementos:
        tags = e.get("tags") or {}
        nome = (tags.get("name") or "").strip()
        centro = e.get("center") or e
        lat, lon = centro.get("lat"), centro.get("lon")
        if not nome or lat is None or lon is None:
            continue
        if not (-34.0 <= lat <= 6.0 and -74.5 <= lon <= -34.0):  # fora do Brasil: dado errado
            continue
        chave = (nome.lower(), round(lat, 3), round(lon, 3))
        if chave in vistos:
            continue
        vistos.add(chave)
        saida.append([nome, round(lat, 5), round(lon, 5)])
    return sorted(saida, key=lambda x: (x[0], x[1], x[2]))


def gerar(arquivo: str | Path, cliente: httpx.Client | None = None) -> int:
    http = cliente or httpx.Client(timeout=httpx.Timeout(300.0, connect=30.0), headers={"User-Agent": config.user_agent})
    for tentativa in range(3):
        r = http.post(OVERPASS, data={"data": CONSULTA})
        if r.status_code in (429, 504):  # servidor ocupado: espera e tenta de novo
            time.sleep(30 * (tentativa + 1))
            continue
        r.raise_for_status()
        break
    else:
        raise RuntimeError("Overpass ocupado; tente de novo mais tarde.")
    lista = filtrar(r.json().get("elements") or [])
    destino = Path(arquivo)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(lista, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(lista)
