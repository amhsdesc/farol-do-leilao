"""Carrega as fontes dos arquivos YAML.

- Um arquivo por fonte em `fontes/` (subpastas permitidas). Arquivos começando com '_' são ignorados.
- `fontes/plataformas/` guarda modelos. Uma fonte usa um modelo com `herda: plataformas/nome.yaml`;
  o YAML da fonte sobrescreve o modelo, e `{site}` nos textos do modelo vira o `site` da fonte.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .config import config


def _mesclar(base: dict, extra: dict) -> dict:
    out = dict(base)
    for k, v in extra.items():
        out[k] = _mesclar(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def _trocar_site(obj: Any, site: str) -> Any:
    if isinstance(obj, str):
        return obj.replace("{site}", site.rstrip("/"))
    if isinstance(obj, dict):
        return {k: _trocar_site(v, site) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_trocar_site(v, site) for v in obj]
    return obj


def ler_fonte(arquivo: Path, pasta: Path) -> dict[str, Any]:
    dados = yaml.safe_load(arquivo.read_text(encoding="utf-8")) or {}
    if "herda" in dados:
        modelo = ler_fonte(pasta / dados.pop("herda"), pasta)
        modelo.pop("id", None)
        dados = _mesclar(modelo, dados)
    if dados.get("site"):
        dados = _trocar_site(dados, dados["site"])
    dados.setdefault("id", arquivo.stem)
    dados.setdefault("ativa", True)
    dados["_arquivo"] = str(arquivo)
    if isinstance(dados.get("uf"), str):
        dados["uf"] = [dados["uf"]]
    return dados


def carregar(pasta: Path | None = None) -> dict[str, dict[str, Any]]:
    pasta = pasta or config.pasta_fontes
    fontes: dict[str, dict[str, Any]] = {}
    for arquivo in sorted(pasta.rglob("*.yaml")):
        rel = arquivo.relative_to(pasta)
        if rel.parts[0] == "plataformas" or arquivo.name.startswith("_"):
            continue
        f = ler_fonte(arquivo, pasta)
        if "tipo" not in f:
            raise ValueError(f"{arquivo}: falta o campo 'tipo'")
        if f["id"] in fontes:
            raise ValueError(f"id de fonte repetido: {f['id']} ({arquivo})")
        fontes[f["id"]] = f
    return fontes
