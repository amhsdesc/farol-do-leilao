"""Lista oficial de imóveis da Caixa (um CSV por UF).

Fonte: https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp
O arquivo tem linhas de título antes do cabeçalho, separador ';' e costuma vir em Latin-1.
O cabeçalho é localizado por pontuação de nomes conhecidos, então pequenas mudanças de layout não quebram.

Configuração (YAML):
    tipo: csv_caixa
    uf: todas                  # ou uma lista, ex.: [DF, GO]
    url_modelo: https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv   # opcional
    arquivo_local: C:/Users/voce/Downloads/Lista_imoveis_{uf}.csv                   # opcional (download manual)
    navegador: false                                                                # true se o site bloquear o download direto
"""
from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from typing import Iterator

from ..modelos import LoteBruto
from ..normalizar import UFS, simplificar
from .base import Adaptador, ErroDeFonte

URL_PADRAO = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv"

ALIASES = {
    "id_externo": ["n do imovel", "no do imovel", "numero do imovel", "n imovel", "imovel"],
    "uf": ["uf", "estado"],
    "cidade": ["cidade", "municipio"],
    "bairro": ["bairro"],
    "endereco": ["endereco", "logradouro"],
    "lance_minimo": ["preco", "valor de venda", "preco de venda", "valor minimo de venda"],
    "valor_avaliacao": ["valor de avaliacao", "avaliacao", "preco avaliacao"],
    "desconto": ["desconto"],
    "descricao": ["descricao"],
    "modalidade": ["modalidade de venda", "modalidade"],
    "url": ["link de acesso", "link", "url"],
}


def _norm(cab: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", simplificar(cab).replace("°", "").replace("º", "")).strip()


def decodificar(conteudo: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return conteudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1", errors="replace")


def ler_csv(texto: str) -> list[dict[str, str]]:
    linhas = list(csv.reader(io.StringIO(texto), delimiter=";"))
    melhor, pontos = -1, 0
    for i, linha in enumerate(linhas[:15]):
        nomes = {_norm(c) for c in linha}
        p = sum(1 for aliases in ALIASES.values() if any(a in nomes for a in aliases))
        if p > pontos:
            melhor, pontos = i, p
    if pontos < 4:
        raise ErroDeFonte("Cabeçalho da lista da Caixa não encontrado nas 15 primeiras linhas (layout mudou?).")
    cab = [_norm(c) for c in linhas[melhor]]
    indice = {}
    for campo, aliases in ALIASES.items():
        for a in aliases:
            if a in cab:
                indice[campo] = cab.index(a)
                break
    registros = []
    for linha in linhas[melhor + 1:]:
        if not any(c.strip() for c in linha):
            continue
        registros.append({campo: (linha[i].strip() if i < len(linha) else "") for campo, i in indice.items()})
    return registros


def para_lote(r: dict[str, str]) -> LoteBruto | None:
    id_ = re.sub(r"\D", "", r.get("id_externo", ""))
    if not id_:
        return None
    desc = r.get("descricao") or ""
    mod = r.get("modalidade") or ""
    m = re.search(r"([12])\s*[ºo°]?\s*leil", simplificar(mod))
    tipo = desc.split(",")[0] if desc else None
    cidade = (r.get("cidade") or "").strip().title() or None
    bairro = (r.get("bairro") or "").strip().title() or None
    return LoteBruto(
        id_externo=id_,
        url=r.get("url") or f"https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel={id_}",
        titulo=" em ".join(filter(None, [tipo or "Imóvel", bairro])) + (f", {cidade}/{r.get('uf')}" if cidade else ""),
        descricao=desc or None,
        tipo=tipo,
        modalidade=mod or None,
        uf=r.get("uf"),
        cidade=cidade,
        bairro=bairro,
        endereco=r.get("endereco"),
        valor_avaliacao=r.get("valor_avaliacao"),
        lance_minimo=r.get("lance_minimo"),
        praca_atual=int(m.group(1)) if m else None,
        leiloeiro="Caixa Econômica Federal",
        comitente="Caixa Econômica Federal",
        dados={"desconto_informado": r.get("desconto"), "modalidade_original": mod},
    )


class CaixaCSV(Adaptador):
    tipo = "csv_caixa"

    def _baixar(self, uf: str) -> bytes:
        local = self.fonte.get("arquivo_local")
        if local:
            caminho = Path(local.format(uf=uf))
            if not caminho.exists():
                raise ErroDeFonte(f"Arquivo local não encontrado: {caminho}")
            return caminho.read_bytes()
        url = self.fonte.get("url_modelo", URL_PADRAO).format(uf=uf)
        if self.fonte.get("navegador"):
            return self.cliente.html_navegador(url).encode("utf-8")
        try:
            return self.cliente.get(url).content
        except Exception as e:
            raise ErroDeFonte(
                f"Falha ao baixar {url}: {e}. Se o site da Caixa bloquear o download automático, "
                "use 'navegador: true' ou 'arquivo_local' no YAML."
            ) from e

    def coletar(self) -> Iterator[LoteBruto]:
        ufs = self.fonte.get("uf") or ["todas"]
        if ufs in (["todas"], ["TODAS"], "todas"):
            ufs = sorted(UFS)
        falhas = []
        for uf in ufs:
            try:
                texto = decodificar(self._baixar(uf))
                registros = ler_csv(texto)
            except ErroDeFonte as e:
                # uma UF que falha não impede as outras; a execução fica 'parcial' e nada é removido
                self.registrar_erro(f"UF {uf}: {e}")
                falhas.append(uf)
                continue
            for r in registros:
                lote = para_lote(r)
                if lote:
                    yield lote
        if falhas and len(falhas) == len(ufs):
            raise ErroDeFonte(f"Nenhuma UF baixada ({', '.join(falhas)}).")
