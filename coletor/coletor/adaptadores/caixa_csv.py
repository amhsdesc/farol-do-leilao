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
    detalhe: true              # lê a página de detalhe de cada imóvel (FGTS, condomínio, praças...); padrão: ligado quando há banco
    detalhe_max_por_rodada: 200     # teto de páginas lidas por coleta (padrão 200; env CAIXA_DETALHE_MAX)
    detalhe_max_segundos: 420       # teto de tempo gasto nas páginas por coleta (padrão 420; env CAIXA_DETALHE_SEGUNDOS)

A página de detalhe é lida por regra fixa, sem IA (ver caixa_detalhe.py). Cada lote é lido uma vez e revalidado só quando
o preço ou a modalidade mudam, ou a cada 30 dias. O resultado fica em `lote.dados['caixa_detalhe']` e é repassado a
cada coleta, porque o CSV não traz esses campos e a gravação sobrescreve o lote inteiro.
"""
from __future__ import annotations

import csv
import io
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from ..modelos import LoteBruto
from ..normalizar import UFS, simplificar
from .base import Adaptador, ErroDeFonte
from .caixa_detalhe import ler_detalhe

log = logging.getLogger(__name__)

URL_PADRAO = "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{uf}.csv"
URL_DETALHE = "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel={id}"

VERSAO_LEITOR = 2               # sobe quando caixa_detalhe passa a ler algo novo: as leituras antigas são refeitas (prioridade 2)
VALIDADE_DETALHE_DIAS = 30      # depois disso a página é lida de novo (FGTS e regras de despesa quase nunca mudam)
RETENTAR_FALHA_HORAS = 24       # página que falhou não é tentada de novo antes disso
MAX_FALHAS_SEGUIDAS = 8         # Caixa bloqueando ou fora do ar: para de insistir nesta rodada
CAMPOS_DO_DETALHE = (
    "aceita_fgts", "aceita_financiamento", "aceita_parcelamento", "debitos_por_conta", "ocupacao",
    "matricula", "cartorio", "data_praca1", "valor_praca1", "data_praca2", "valor_praca2", "fotos",
)

FOTO_URL = "https://venda-imoveis.caixa.gov.br/fotos/F{id}{n}.jpg"  # F + nº do imóvel + 21, 22, 23...
FOTO_PRIMEIRA = 21
FOTO_MAX_POR_IMOVEL = 10
FOTO_REVERIFICAR_DIAS = 7       # imóvel sem foto é consultado de novo depois disso
FOTO_MAX_POR_RODADA = 3000
FOTO_MAX_SEGUNDOS = 420
FOTO_PARALELO = 6

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

    # ------------------------------------------------------------ página de detalhe

    def _detalhe_ligado(self) -> bool:
        cfg = self.fonte.get("detalhe")
        return bool(cfg) if cfg is not None else self.conn is not None

    def _carregar_cache(self) -> dict[str, dict[str, Any]]:
        """O que já foi lido de cada lote (guardado em lote.dados). Sem banco, não há cache."""
        if self.conn is None:
            return {}
        with self.conn.cursor() as cur:
            cur.execute(
                "select id_externo, dados->'caixa_detalhe' as d from lote "
                "where fonte_id = %s and dados->'caixa_detalhe' is not null",
                (self.fonte["id"],),
            )
            linhas = cur.fetchall()
        self.conn.commit()  # não deixa a conexão parada em transação aberta durante as leituras no site
        return {r["id_externo"]: r["d"] for r in linhas if isinstance(r["d"], dict)}

    @staticmethod
    def _chave_lista(lote: LoteBruto) -> str:
        return f"{lote.lance_minimo}|{lote.modalidade}"

    @staticmethod
    def _antes_de(iso: str | None, delta: timedelta, agora: datetime) -> bool:
        try:
            return bool(iso) and datetime.fromisoformat(iso) < agora - delta
        except (TypeError, ValueError):
            return True

    def _prioridade(self, c: dict[str, Any] | None, lote: LoteBruto, agora: datetime) -> int | None:
        """0 = nunca lido, 1 = preço/modalidade mudou desde a leitura, 2 = leitura vencida, None = não precisa."""
        if c and c.get("falhou_em") and not self._antes_de(c["falhou_em"], timedelta(hours=RETENTAR_FALHA_HORAS), agora):
            return None
        if not c or not c.get("lido_em"):
            return 0
        if c.get("chave_lista") != self._chave_lista(lote):
            return 1
        if c.get("v", 1) < VERSAO_LEITOR or self._antes_de(c["lido_em"], timedelta(days=VALIDADE_DETALHE_DIAS), agora):
            return 2
        return None

    @staticmethod
    def _aplicar(lote: LoteBruto, c: dict[str, Any]) -> None:
        campos = c.get("campos") or {}
        for k in CAMPOS_DO_DETALHE:
            if campos.get(k) is not None:
                setattr(lote, k, campos[k])
        if campos.get("leiloeiro"):  # quem conduz o leilão; o comitente continua sendo a Caixa
            lote.leiloeiro = campos["leiloeiro"]
        lote.dados = {**lote.dados, "caixa_detalhe": c}

    def _enriquecer_com_detalhe(self, lotes: list[LoteBruto]) -> None:
        cache = self._carregar_cache()
        agora = datetime.now(timezone.utc)
        fila = []
        for lote in lotes:
            p = self._prioridade(cache.get(lote.id_externo), lote, agora)
            if p is not None:
                fila.append((p, lote))
        fila.sort(key=lambda x: x[0])  # estável: novos primeiro, depois mudados, depois vencidos

        max_n = int(self.fonte.get("detalhe_max_por_rodada") or os.getenv("CAIXA_DETALHE_MAX") or 200)
        max_s = float(self.fonte.get("detalhe_max_segundos") or os.getenv("CAIXA_DETALHE_SEGUNDOS") or 420)
        inicio = time.monotonic()
        lidos = falhas = seguidas = 0
        for _, lote in fila[:max_n]:
            if time.monotonic() - inicio > max_s:
                break
            anterior = cache.get(lote.id_externo) or {}
            agora_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
            try:
                r = self.cliente.get(URL_DETALHE.format(id=lote.id_externo))
                html = decodificar(r.content)
                campos = ler_detalhe(html)
                if not campos:
                    trecho = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()[:160]
                    raise ValueError(
                        f"página sem nenhum dado reconhecido (status {r.status_code}, {len(r.content)} bytes; início: {trecho})"
                    )
            except Exception as e:
                falhas += 1
                seguidas += 1
                # guarda a falha (e o que já se sabia) para não tentar o mesmo lote toda rodada
                cache[lote.id_externo] = {**anterior, "falhou_em": agora_iso, "motivo": str(e)[:300]}
                log.warning("[%s] detalhe %s: %s", self.fonte.get("id"), lote.id_externo, e)
                if seguidas >= MAX_FALHAS_SEGUIDAS:
                    self.avisos.append(f"detalhe da Caixa: {seguidas} falhas seguidas ({str(e)[:120]}); leitura interrompida nesta rodada")
                    break
                continue
            seguidas = 0
            lidos += 1
            cache[lote.id_externo] = {"v": VERSAO_LEITOR, "lido_em": agora_iso, "chave_lista": self._chave_lista(lote), "campos": campos}

        for lote in lotes:
            c = cache.get(lote.id_externo)
            if c:
                self._aplicar(lote, c)
        pendentes = max(0, len(fila) - lidos - falhas)
        self.avisos.append(f"detalhe da Caixa: {lidos} lidos, {falhas} falhas, {pendentes} ainda na fila")

    # ------------------------------------------------------------ fotos por endereço

    def _foto_existe(self, url: str) -> bool:
        """True só se a Caixa devolve uma imagem (a ausência vem como 404 com página HTML)."""
        with self.cliente.http.stream("GET", url, timeout=20) as r:
            return r.status_code == 200 and r.headers.get("content-type", "").startswith("image")

    def _fotos_do_imovel(self, id_externo: str) -> list[str]:
        """Procura F<id>21.jpg, 22, 23... (se a 21 não existe, tenta a 22) e para na primeira que falta."""
        achadas: list[str] = []
        n = FOTO_PRIMEIRA
        while len(achadas) < FOTO_MAX_POR_IMOVEL and n < FOTO_PRIMEIRA + FOTO_MAX_POR_IMOVEL + 1:
            url = FOTO_URL.format(id=id_externo, n=n)
            if self._foto_existe(url):
                achadas.append(url)
            elif achadas or n > FOTO_PRIMEIRA:
                break
            n += 1
        return achadas

    def _verificar_fotos(self, lotes: list[LoteBruto]) -> None:
        """Descobre as fotos sem abrir a página de detalhe. O resultado fica em lote.fotos (quando há) e
        `lote.dados['caixa_foto']` (quando não há, para não perguntar de novo todo dia)."""
        if self.conn is None:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                "select id_externo, cardinality(fotos) as n, dados->'caixa_foto' as f from lote where fonte_id = %s",
                (self.fonte["id"],),
            )
            estado = {r["id_externo"]: r for r in cur.fetchall()}
        self.conn.commit()
        agora = datetime.now(timezone.utc)
        fila: list[LoteBruto] = []
        for lote in lotes:
            if lote.fotos:  # o detalhe já trouxe
                continue
            e = estado.get(lote.id_externo)
            if e and (e.get("n") or 0) > 0:
                continue
            f = e.get("f") if e and isinstance(e.get("f"), dict) else None
            if f and f.get("verificado_em") and not self._antes_de(f["verificado_em"], timedelta(days=FOTO_REVERIFICAR_DIAS), agora):
                lote.dados = {**lote.dados, "caixa_foto": f}
                continue
            fila.append(lote)
        fila = fila[:FOTO_MAX_POR_RODADA]
        inicio = time.monotonic()

        def trabalhar(lote: LoteBruto) -> tuple[LoteBruto, list[str] | None]:
            if time.monotonic() - inicio > FOTO_MAX_SEGUNDOS:
                return lote, None
            try:
                return lote, self._fotos_do_imovel(lote.id_externo)
            except Exception:  # rede/limite: tenta de novo na próxima rodada, sem marcar como "sem foto"
                return lote, None

        com = sem = pulados = 0
        with ThreadPoolExecutor(max_workers=FOTO_PARALELO) as ex:
            for lote, fotos in ex.map(trabalhar, fila):
                if fotos is None:
                    pulados += 1
                elif fotos:
                    lote.fotos = fotos
                    com += 1
                else:
                    lote.dados = {**lote.dados, "caixa_foto": {"verificado_em": agora.isoformat(timespec="seconds"), "achou": False}}
                    sem += 1
        self.avisos.append(f"fotos da Caixa: {com} com foto, {sem} sem foto, {pulados} não verificados nesta rodada")

    # ------------------------------------------------------------ coleta

    def coletar(self) -> Iterator[LoteBruto]:
        ufs = self.fonte.get("uf") or ["todas"]
        if ufs in (["todas"], ["TODAS"], "todas"):
            ufs = sorted(UFS)
        falhas = []
        lotes: list[LoteBruto] = []
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
                    lotes.append(lote)
        if falhas and len(falhas) == len(ufs):
            raise ErroDeFonte(f"Nenhuma UF baixada ({', '.join(falhas)}).")
        if lotes and self._detalhe_ligado():
            try:
                self._enriquecer_com_detalhe(lotes)
            except Exception as e:  # o detalhe é um complemento: nunca impede a lista de ser gravada
                log.exception("detalhe da Caixa")
                self.avisos.append(f"detalhe da Caixa não aplicado: {type(e).__name__}: {e}"[:200])
        if lotes and self.fonte.get("fotos_por_endereco", True):
            try:
                self._verificar_fotos(lotes)
            except Exception as e:  # complemento: nunca impede a lista de ser gravada
                log.exception("fotos da Caixa")
                self.avisos.append(f"fotos da Caixa não verificadas: {type(e).__name__}: {e}"[:200])
        yield from lotes
