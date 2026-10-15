"""Gera a lista de universidades do Brasil a partir do OpenStreetMap (Overpass), para a tag "universitário".

Roda uma vez (no seu computador) e o resultado fica no projeto: `coletor/dados_ref/universidades.json`, com
[nome, lat, lon]. Pega todo `amenity=university` com nome e as unidades (`amenity=college`) das grandes redes privadas
(Estácio, UNIP, Anhanguera, Uninove, Unopar, Unicesumar, Uninter etc.). Uma única consulta, identificada pelo User-Agent.
"""
from __future__ import annotations

import json
import re
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

_INSTITUICAO = re.compile(
    r"universi|faculdade|facul\b|centro universit|instituto federal|instituto superior|escola superior|campus|"
    r"\b(ufrj|ufmg|ufrgs|ufsc|ufpr|ufba|ufpe|ufc|ufpa|ufam|ufg|ufmt|ufms|ufes|ufu|ufscar|ufrn|ufpb|ufal|ufs|ufma|ufpi|"
    r"unb|unicamp|unesp|usp|uerj|uel|uem|uepg|uespi|uema|uece|uern|uepb|uneb|uesc|uefs|uenf|uems|udesc|utfpr|"
    r"ifsp|ifrj|ifmg|ifpr|ifsc|ifrs|ifba|ifpe|ifce|ifpa|ifam|ifg|ifes|cefet|fatec|senac|senai|unip|uninove|"
    r"unisul|unifor|unisinos|ulbra|puc|pucrs|pucsp|pucminas|fgv|insper|espm|fmu|fei|ita|ime|ipa|ufabc|ufrb|ufrr|ufac|ufam|"
    r"unir|unifap|uft|ufjf|ufla|ufv|ufop|ufvjm|ufsj|ufu|ufcg|ufersa|ufpel|furg|ufsm|ufrpe|ufrrj|uff|unirio|unifesp)\b|"
    r"estacio|estácio|anhanguera|unopar|unicesumar|uninter|unifacs|uninassau|uniasselvi|unigranrio|unisanta|"
    r"mackenzie|cruzeiro do sul|são judas|sao judas|ibmec|fiap|unifran|unimep|unitau|unaerp|uniube|uniderp|unic\b|unama|"
    r"unip|unisagrado|unicid|unicsul|metodista|salesiano|fumec|newton paiva|faculdades",
    re.I,
)
_NAO_E_CAMPUS = re.compile(
    r"departamento|laborat|anatomia|biblioteca|hospital|ambulat|curso de|programa de|n[úu]cleo|coordena|diretoria|"
    r"administra[çc][ãa]o do|refeit|restaurante|ginásio|ginasio|quadra|estacionamento|creche|col[ée]gio|escola (?:municipal|estadual)|"
    r"bloco|sala |cl[íi]nica|complexo|zootecnia|semiot|gre\b|secretaria|ag[êe]ncia|mestrado|doutorado|resid[êe]ncia (?:estudantil|universit)|moradia",
    re.I,
)


def eh_instituicao(nome: str) -> bool:
    """Nome de instituição de ensino superior de verdade: descarta números, departamentos, laboratórios e setores.

    Passa quem tem palavra de instituição (universidade, faculdade, campus, siglas conhecidas) ou é uma sigla/marca de
    uma palavra só (Unesc, UEPA, Fucapi), que no OpenStreetMap quase sempre é a instituição.
    """
    n = (nome or "").strip()
    if len(n) < 3 or n[0].isdigit() or _NAO_E_CAMPUS.search(n):
        return False
    return bool(_INSTITUICAO.search(n)) or bool(re.fullmatch(r"[A-Za-zÀ-ÿ]{4,12}", n))

def filtrar(elementos: list[dict[str, Any]]) -> list[list[Any]]:
    """[nome, lat, lon] sem repetir o mesmo nome no mesmo quarteirão (~100 m)."""
    vistos: set[tuple[str, float, float]] = set()
    saida: list[list[Any]] = []
    for e in elementos:
        tags = e.get("tags") or {}
        nome = (tags.get("name") or "").strip()
        centro = e.get("center") or e
        lat, lon = centro.get("lat"), centro.get("lon")
        if not nome or lat is None or lon is None or not eh_instituicao(nome):
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
