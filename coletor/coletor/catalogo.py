"""Catálogo de cobertura: quem vende imóveis em leilão (comitentes) e quem leiloa (leiloeiros).

Três arquivos em coletor/catalogo/:

- leiloeiros.csv       todos os leiloeiros que queremos cobrir, com a validação oficial
                       (junta comercial ou tribunal), se trabalham com imóveis e qual fonte os coleta.
- comitentes.csv       bancos, órgãos e empresas que vendem imóveis, onde vendem e por quais leiloeiros.
- fontes_oficiais.csv  onde buscar as listas oficiais (27 juntas, tribunais, federação).
- sites_falsos.csv     domínios denunciados como golpe: nunca viram fonte.

Regra de ouro: só entra como fonte quem é leiloeiro oficial validado, banco/órgão com site próprio,
ou plataforma que publica leilões de leiloeiros oficiais. Agregadores concorrentes NÃO são fonte.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from .config import PASTA_COLETOR
from .normalizar import UFS, simplificar

PASTA_CATALOGO = PASTA_COLETOR / "catalogo"
ARQ_LEILOEIROS = PASTA_CATALOGO / "leiloeiros.csv"
ARQ_COMITENTES = PASTA_CATALOGO / "comitentes.csv"
ARQ_OFICIAIS = PASTA_CATALOGO / "fontes_oficiais.csv"
ARQ_FALSOS = PASTA_CATALOGO / "sites_falsos.csv"

COL_LEILOEIROS = [
    "id", "nome", "site", "uf_atuacao", "junta", "matricula", "status_validacao", "validado_por",
    "validado_em", "faz_imoveis", "plataforma", "comitentes", "site_no_ar", "verificado_em", "fonte_id",
    "observacao",
]
COL_COMITENTES = [
    "id", "nome", "tipo", "site_oficial", "pagina_imoveis", "como_vende", "leiloeiros", "fonte_id",
    "referencia", "observacao",
]
COL_OFICIAIS = ["tipo", "nome", "uf", "url", "formato", "importado_em", "observacao"]
COL_FALSOS = ["dominio", "fonte", "incluido_em"]

# status_validacao: validado (achado em lista oficial) | pendente | suspeito (lista de sites falsos) | inativo
# faz_imoveis: sim | nao | a_verificar


# ---------------------------------------------------------------- arquivos

def ler(arquivo: Path, colunas: list[str]) -> list[dict[str, str]]:
    if not arquivo.exists():
        return []
    with arquivo.open(encoding="utf-8", newline="") as fh:
        return [{c: (l.get(c) or "").strip() for c in colunas} for l in csv.DictReader(fh)]


def gravar(arquivo: Path, linhas: list[dict[str, str]], colunas: list[str]) -> None:
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    with arquivo.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=colunas, extrasaction="ignore")
        w.writeheader()
        for l in linhas:
            w.writerow({c: l.get(c, "") for c in colunas})


def dominio(url: str | None) -> str:
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    return urlparse(url).netloc.lower().removeprefix("www.")


def slug(texto: str) -> str:
    t = simplificar(texto)
    t = re.sub(r"\b(leiloeiro|leiloeira|oficial|publico|ltda|me|eireli|s\.?a)\b", " ", t)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60] or "leiloeiro"


def _nome_parecido(a: str, b: str) -> bool:
    sa, sb = simplificar(a), simplificar(b)
    if not sa or not sb:
        return False
    return sa == sb or SequenceMatcher(None, sa, sb).ratio() >= 0.9


# ---------------------------------------------------------------- importação de listas oficiais

@dataclass
class RegistroOficial:
    nome: str
    matricula: str = ""
    site: str = ""
    uf: str = ""


def _linhas_planilha(arquivo: Path) -> list[dict[str, str]]:
    suf = arquivo.suffix.lower()
    if suf in (".xlsx", ".xlsm"):
        try:
            from openpyxl import load_workbook
        except ImportError as e:
            raise RuntimeError("Para ler .xlsx: pip install openpyxl") from e
        ws = load_workbook(arquivo, read_only=True, data_only=True).active
        linhas = [[("" if v is None else str(v)) for v in r] for r in ws.iter_rows(values_only=True)]
        # cabeçalho = primeira linha com 'nome'
        i = next((k for k, l in enumerate(linhas[:20]) if any("nome" in simplificar(c) for c in l)), 0)
        cab = linhas[i]
        return [dict(zip(cab, l)) for l in linhas[i + 1:] if any(l)]
    from .adaptadores.caixa_csv import decodificar
    texto = decodificar(arquivo.read_bytes())
    dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t|")
    return list(csv.DictReader(texto.splitlines(), dialect=dialeto))


def _registros_pdf(arquivo: Path) -> list[RegistroOficial]:
    """Listas em PDF (comuns nas juntas): tenta tabelas; se não houver, lê linha a linha."""
    try:
        import pdfplumber
    except ImportError as e:
        raise RuntimeError("Para ler PDF: pip install pdfplumber") from e
    regs: list[RegistroOficial] = []
    with pdfplumber.open(arquivo) as pdf:
        for pag in pdf.pages:
            for tabela in pag.extract_tables() or []:
                for linha in tabela:
                    celulas = [c.strip() for c in linha if c and c.strip()]
                    nome = next((c for c in celulas if len(c.split()) >= 2 and not re.search(r"\d{3,}", c)), "")
                    mat = next((c for c in celulas if re.fullmatch(r"\d{1,5}(/\d{2,4})?", c)), "")
                    site = next((c for c in celulas if re.search(r"www\.|https?://|\.com", c, re.I)), "")
                    if nome and "nome" not in simplificar(nome):
                        regs.append(RegistroOficial(nome, mat, site))
            if not regs:
                for linha in (pag.extract_text() or "").splitlines():
                    m = re.match(r"^\s*(\d{1,5})\s*[-–.]?\s*([A-ZÀ-Ú][A-ZÀ-Ú' .]{5,})", linha)
                    if m:
                        site = re.search(r"((?:https?://)?www\.[\w.-]+)", linha)
                        regs.append(RegistroOficial(m.group(2).strip(), m.group(1), site.group(1) if site else ""))
    return regs


def ler_lista_oficial(arquivo: Path) -> list[RegistroOficial]:
    if arquivo.suffix.lower() == ".pdf":
        return _registros_pdf(arquivo)
    linhas = _linhas_planilha(arquivo)
    if not linhas:
        return []

    def coluna(*pistas: str) -> str | None:
        for c in linhas[0].keys():
            if c and any(p in simplificar(c) for p in pistas):
                return c
        return None

    c_nome = coluna("nome", "leiloeiro")
    c_mat = coluna("matricula", "registro", "numero")
    c_site = coluna("site", "sitio", "endereco eletronico", "url", "pagina", "internet")
    c_uf = coluna("uf")
    if not c_nome:
        raise ValueError(f"Coluna de nome não encontrada. Colunas: {list(linhas[0])}")
    out = []
    for l in linhas:
        nome = (l.get(c_nome) or "").strip()
        if nome:
            out.append(RegistroOficial(
                nome=nome,
                matricula=(l.get(c_mat) or "").strip() if c_mat else "",
                site=(l.get(c_site) or "").strip() if c_site else "",
                uf=(l.get(c_uf) or "").strip().upper() if c_uf else "",
            ))
    return out


@dataclass
class ResultadoImportacao:
    lidos: int = 0
    validados_existentes: int = 0
    novos: int = 0
    novos_ids: list[str] = field(default_factory=list)


def importar_lista_oficial(
    registros: Iterable[RegistroOficial], junta: str, uf: str, linhas: list[dict[str, str]]
) -> ResultadoImportacao:
    """Cruza a lista oficial com o catálogo: quem bate vira 'validado'; quem não existe entra."""
    r = ResultadoImportacao()
    hoje = date.today().isoformat()
    ids = {l["id"] for l in linhas}
    for reg in registros:
        r.lidos += 1
        site = reg.site if not reg.site or reg.site.startswith("http") else "https://" + reg.site.lstrip("/")
        alvo = next(
            (l for l in linhas
             if (site and dominio(site) and dominio(site) == dominio(l["site"])) or _nome_parecido(reg.nome, l["nome"])),
            None,
        )
        uf_reg = reg.uf if reg.uf in UFS else uf
        if alvo:
            alvo.update(status_validacao="validado" if alvo["status_validacao"] != "suspeito" else "suspeito",
                        validado_por=junta, validado_em=hoje)
            alvo["junta"] = alvo["junta"] or junta
            alvo["matricula"] = alvo["matricula"] or reg.matricula
            alvo["site"] = alvo["site"] or site
            if uf_reg and uf_reg not in alvo["uf_atuacao"].split("|"):
                alvo["uf_atuacao"] = "|".join(filter(None, [alvo["uf_atuacao"], uf_reg]))
            r.validados_existentes += 1
        else:
            novo_id = base = slug(reg.nome)
            n = 2
            while novo_id in ids:
                novo_id, n = f"{base}-{n}", n + 1
            ids.add(novo_id)
            linhas.append({
                "id": novo_id, "nome": reg.nome.title() if reg.nome.isupper() else reg.nome, "site": site,
                "uf_atuacao": uf_reg, "junta": junta, "matricula": reg.matricula,
                "status_validacao": "validado", "validado_por": junta, "validado_em": hoje,
                "faz_imoveis": "a_verificar", "plataforma": "", "comitentes": "", "site_no_ar": "",
                "verificado_em": "", "fonte_id": "", "observacao": "importado da lista oficial",
            })
            r.novos += 1
            r.novos_ids.append(novo_id)
    return r


def aplicar_sites_falsos(linhas: list[dict[str, str]], falsos: set[str]) -> list[str]:
    marcados = []
    for l in linhas:
        if l["site"] and dominio(l["site"]) in falsos:
            l["status_validacao"] = "suspeito"
            l["observacao"] = "domínio na lista de sites falsos; " + l["observacao"]
            marcados.append(l["id"])
    return marcados


# ---------------------------------------------------------------- verificação dos sites

SINAIS_IMOVEIS = re.compile(
    r"im[oó]ve(?:l|is)|apartamento|terreno|\bcasa\b|/lotes/imovel|categoria[=/]im|/imoveis", re.I
)
LINK_IMOVEIS = re.compile(r"href=[\"'][^\"']*(im[oó]ve(?:l|is)|/lotes/imovel|apartament|terreno)", re.I)


@dataclass
class Verificacao:
    no_ar: bool
    faz_imoveis: str
    plataforma: str
    detalhe: str = ""


def analisar_html(html: str) -> Verificacao:
    from .inspecionar import identificar_plataforma
    plataformas = [p for p in identificar_plataforma(html) if p != "wordpress"]
    mencoes = len(SINAIS_IMOVEIS.findall(html))
    links = len(LINK_IMOVEIS.findall(html))
    if links >= 1 or mencoes >= 5:
        faz = "sim"
    elif mencoes == 0:
        faz = "nao"
    else:
        faz = "a_verificar"
    return Verificacao(True, faz, plataformas[0] if plataformas else "", f"{links} links, {mencoes} menções a imóveis")


def verificar_sites(linhas: list[dict[str, str]], cliente, limite: int = 50, todos: bool = False,
                    falsos: set[str] | None = None) -> list[tuple[str, Verificacao]]:
    """Abre a página inicial de cada leiloeiro: está no ar? trabalha com imóveis? qual plataforma?"""
    falsos = falsos or set()
    hoje = date.today().isoformat()
    feitos = []
    for l in linhas:
        if len(feitos) >= limite:
            break
        if not l["site"] or l["status_validacao"] == "suspeito":
            continue
        if not todos and l["verificado_em"]:
            continue
        if dominio(l["site"]) in falsos:
            l["status_validacao"] = "suspeito"
            continue
        try:
            v = analisar_html(cliente.get(l["site"]).text)
        except Exception as e:
            v = Verificacao(False, l["faz_imoveis"] or "a_verificar", l["plataforma"], f"erro: {type(e).__name__}")
        l["site_no_ar"] = "sim" if v.no_ar else "nao"
        if v.no_ar:
            # 'sim' manual não é rebaixado pela heurística; 'nao' só vale se não houver sinal nenhum
            if l["faz_imoveis"] != "sim":
                l["faz_imoveis"] = v.faz_imoveis
            l["plataforma"] = v.plataforma or l["plataforma"]
        l["verificado_em"] = hoje
        feitos.append((l["id"], v))
    return feitos


# ---------------------------------------------------------------- cobertura e fontes

def cobertura(leiloeiros: list[dict[str, str]], comitentes: list[dict[str, str]], ids_fontes: set[str]) -> dict:
    def conta(pred):
        return sum(1 for l in leiloeiros if pred(l))

    por_uf: dict[str, dict[str, int]] = {}
    for l in leiloeiros:
        for uf in list(filter(None, l["uf_atuacao"].split("|"))) or ["nacional"]:
            d = por_uf.setdefault(uf, {"leiloeiros": 0, "imoveis": 0, "com_fonte": 0})
            d["leiloeiros"] += 1
            d["imoveis"] += l["faz_imoveis"] == "sim"
            d["com_fonte"] += bool(l["fonte_id"] and l["fonte_id"] in ids_fontes)
    return {
        "leiloeiros": len(leiloeiros),
        "validados": conta(lambda l: l["status_validacao"] == "validado"),
        "pendentes": conta(lambda l: l["status_validacao"] == "pendente"),
        "suspeitos": conta(lambda l: l["status_validacao"] == "suspeito"),
        "fazem_imoveis": conta(lambda l: l["faz_imoveis"] == "sim"),
        "a_verificar": conta(lambda l: l["faz_imoveis"] == "a_verificar"),
        "com_fonte": conta(lambda l: l["fonte_id"] and l["fonte_id"] in ids_fontes),
        "imoveis_sem_fonte": [l["id"] for l in leiloeiros
                              if l["faz_imoveis"] == "sim" and l["status_validacao"] != "suspeito"
                              and not (l["fonte_id"] and l["fonte_id"] in ids_fontes)],
        "comitentes": len(comitentes),
        "comitentes_com_fonte": sum(1 for c in comitentes if c["fonte_id"] and c["fonte_id"] in ids_fontes),
        "por_uf": dict(sorted(por_uf.items())),
    }


def yaml_fonte_leiloeiro(l: dict[str, str], pasta_fontes: Path) -> str:
    ufs = [u for u in l["uf_atuacao"].split("|") if u in UFS] or ["todas"]
    site = l["site"].rstrip("/")
    cabecalho = (
        f"# Criado pelo catálogo ({date.today().isoformat()}). Validação: {l['status_validacao']}"
        f"{' por ' + l['validado_por'] if l['validado_por'] else ''}.\n"
    )
    modelo = pasta_fontes / "plataformas" / f"{l['plataforma']}.yaml"
    if l["plataforma"] and modelo.exists():
        return cabecalho + (
            f"herda: plataformas/{l['plataforma']}.yaml\n"
            f"id: {l['id']}\nnome: {l['nome']}\nsite: {site}\nuf: [{', '.join(ufs)}]\n"
        )
    return cabecalho + (
        "# Tipo automático (IA). Se o volume passar de ~50 lotes, rode `inspecionar` e troque por json_api/seletores.\n"
        f"id: {l['id']}\nnome: {l['nome']}\nsite: {site}\ntipo: automatico\nuf: [{', '.join(ufs)}]\n"
        f"inicio:\n  - {site}\nmax_paginas_lista: 10\nmax_lotes: 200\nnavegador: false\n"
    )


def criar_fontes(leiloeiros: list[dict[str, str]], ids_fontes: set[str], pasta_fontes: Path,
                 incluir_pendentes: bool = False) -> list[str]:
    """Cria YAML para cada leiloeiro que faz imóveis e ainda não tem fonte."""
    pasta = pasta_fontes / "leiloeiros"
    pasta.mkdir(parents=True, exist_ok=True)
    criados = []
    for l in leiloeiros:
        aceitos = {"validado", "pendente"} if incluir_pendentes else {"validado"}
        if l["faz_imoveis"] != "sim" or l["status_validacao"] not in aceitos or not l["site"]:
            continue
        if l["fonte_id"] and l["fonte_id"] in ids_fontes:
            continue
        arquivo = pasta / f"{l['id']}.yaml"
        if not arquivo.exists():
            arquivo.write_text(yaml_fonte_leiloeiro(l, pasta_fontes), encoding="utf-8")
            criados.append(l["id"])
        l["fonte_id"] = l["id"]
    return criados
