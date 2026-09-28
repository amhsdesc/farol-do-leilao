"""Adaptador automático para a cauda longa de leiloeiros: qualquer site, sem escrever seletores.

Como funciona:
  1. Abre as páginas iniciais e segue a paginação (links do mesmo domínio com "pagina", "page" etc.).
  2. Separa os links que parecem de lote (padrão do YAML ou heurística de URL).
  3. Em cada lote, reduz a página a texto e pede ao Claude (Haiku) que preencha os campos.
  4. Guarda o hash do texto em `pagina_cache`: página que não mudou não é reenviada (não paga duas vezes).

Configuração:
    tipo: automatico
    inicio: [https://www.leiloeiro.com.br/imoveis]
    padrao_link_lote: "/lote/\\d+"      # opcional, melhora muito a precisão
    max_paginas_lista: 10
    max_lotes: 300
    navegador: false

Custo aproximado: 3 mil tokens por página nova. Com Haiku, centavos de dólar por dezena de páginas.
O limite por execução está em LLM_MAX_PAGINAS_POR_EXECUCAO (.env).
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterator
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from psycopg.types.json import Jsonb

from ..config import config
from ..modelos import LoteBruto
from .base import Adaptador, ErroDeFonte

HEURISTICA_LOTE = re.compile(r"(lote|imovel|imoveis|leilao|item|produto|detalhe|bem)[^?#]*\d{2,}", re.I)
HEURISTICA_PAGINACAO = re.compile(r"([?&](pagina|page|p|pg)=\d+|/(pagina|page)/\d+)", re.I)
LIMITE_TEXTO = 14000

FERRAMENTA = {
    "name": "registrar_lote",
    "description": "Registra os dados de UM lote de leilão de imóvel extraídos da página.",
    "input_schema": {
        "type": "object",
        "properties": {
            "eh_lote_de_imovel": {"type": "boolean", "description": "false se a página não é de um lote de imóvel (ex.: veículo, página institucional, lista)"},
            "titulo": {"type": "string"},
            "tipo": {"type": "string", "description": "apartamento, casa, terreno, rural, comercial, galpao ou outros"},
            "modalidade": {"type": "string", "description": "judicial, extrajudicial, venda_direta ou licitacao"},
            "status": {"type": "string", "description": "aberto, suspenso, encerrado, arrematado, deserto"},
            "uf": {"type": "string"}, "cidade": {"type": "string"}, "bairro": {"type": "string"},
            "endereco": {"type": "string", "description": "logradouro, número e complemento"},
            "area_privativa": {"type": "number"}, "area_total": {"type": "number"}, "area_terreno": {"type": "number"},
            "quartos": {"type": "integer"}, "vagas": {"type": "integer"},
            "matricula": {"type": "string"}, "cartorio": {"type": "string"},
            "valor_avaliacao": {"type": "number"},
            "data_praca1": {"type": "string", "description": "AAAA-MM-DDTHH:MM"},
            "valor_praca1": {"type": "number"},
            "data_praca2": {"type": "string", "description": "AAAA-MM-DDTHH:MM"},
            "valor_praca2": {"type": "number"},
            "ocupacao": {"type": "string", "description": "ocupado, desocupado ou nao_informado. Só afirme se o texto disser."},
            "aceita_financiamento": {"type": "boolean"}, "aceita_fgts": {"type": "boolean"},
            "aceita_parcelamento": {"type": "boolean", "description": "só se a página disser que aceita (ou não) pagamento parcelado"},
            "debitos_por_conta": {"type": "string", "description": "quem paga IPTU/condomínio atrasados: vendedor ou arrematante. Omita se a página não disser."},
            "processo": {"type": "string", "description": "número do processo judicial, se houver"},
            "leiloeiro": {"type": "string"},
        },
        "required": ["eh_lote_de_imovel"],
    },
}

INSTRUCAO = (
    "Você extrai dados de páginas de leiloeiros brasileiros. Preencha só o que está escrito na página; "
    "deixe de fora o que não aparece. Valores em reais como número (1234567.89). "
    "Ocupação: só 'ocupado' ou 'desocupado' se o texto afirmar; caso contrário 'nao_informado'."
)


def texto_principal(html: str) -> str:
    sopa = BeautifulSoup(html, "lxml")
    for t in sopa(["script", "style", "noscript", "svg", "header", "footer", "nav", "form", "iframe"]):
        t.decompose()
    texto = re.sub(r"\n\s*\n+", "\n", sopa.get_text("\n", strip=True))
    return texto[:LIMITE_TEXTO]


class Automatico(Adaptador):
    tipo = "automatico"

    def __init__(self, *a, llm_transport: httpx.BaseTransport | None = None, **kw):
        super().__init__(*a, **kw)
        self.llm = httpx.Client(timeout=90, transport=llm_transport)
        self.chamadas_llm = 0

    # ------------------------------------------------------------ navegação

    def _html(self, url: str) -> str:
        return self.cliente.html_navegador(url) if self.fonte.get("navegador") else self.cliente.get(url).text

    def descobrir_links(self) -> list[str]:
        inicio = self.fonte.get("inicio") or []
        if isinstance(inicio, str):
            inicio = [inicio]
        if not inicio:
            raise ErroDeFonte("Informe 'inicio' (URLs da listagem de imóveis) no YAML.")
        dominio = urlparse(inicio[0]).netloc
        padrao = re.compile(self.fonte["padrao_link_lote"], re.I) if self.fonte.get("padrao_link_lote") else HEURISTICA_LOTE
        fila, visitadas, lotes = list(inicio), set(), []
        while fila and len(visitadas) < int(self.fonte.get("max_paginas_lista", 10)):
            url = fila.pop(0)
            if url in visitadas:
                continue
            visitadas.add(url)
            try:
                sopa = BeautifulSoup(self._html(url), "lxml")
            except Exception as e:
                self.registrar_erro(f"Listagem {url}: {e}")
                continue
            for a in sopa.select("a[href]"):
                href = urljoin(url, a["href"]).split("#")[0]
                if urlparse(href).netloc != dominio:
                    continue
                if padrao.search(href) and href not in lotes:
                    lotes.append(href)
                elif HEURISTICA_PAGINACAO.search(href) and href not in visitadas:
                    fila.append(href)
        return lotes[: int(self.fonte.get("max_lotes", 300))]

    # ------------------------------------------------------------ cache e LLM

    def _cache(self, url: str) -> dict | None:
        if not self.conn:
            return None
        with self.conn.cursor() as cur:
            cur.execute("select hash_texto, extraido from pagina_cache where url = %s", (url,))
            return cur.fetchone()

    def _salvar_cache(self, url: str, h: str, extraido: dict) -> None:
        if not self.conn:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                """insert into pagina_cache (url, hash_texto, extraido) values (%s, %s, %s)
                   on conflict (url) do update set hash_texto = excluded.hash_texto,
                   extraido = excluded.extraido, atualizado_em = now()""",
                (url, h, Jsonb(extraido)),
            )
        self.conn.commit()

    def extrair_com_llm(self, texto: str, url: str) -> dict[str, Any]:
        if not config.anthropic_api_key:
            raise ErroDeFonte("Fonte automática precisa de ANTHROPIC_API_KEY no .env.")
        r = self.llm.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": config.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": config.modelo_llm,
                "max_tokens": 1024,
                "system": INSTRUCAO,
                "tools": [FERRAMENTA],
                "tool_choice": {"type": "tool", "name": "registrar_lote"},
                "messages": [{"role": "user", "content": f"URL: {url}\n\nTexto da página:\n{texto}"}],
            },
        )
        r.raise_for_status()
        self.chamadas_llm += 1
        for bloco in r.json().get("content", []):
            if bloco.get("type") == "tool_use":
                return bloco.get("input") or {}
        return {}

    # ------------------------------------------------------------ coleta

    def coletar(self) -> Iterator[LoteBruto]:
        limite = config.llm_max_paginas_por_execucao
        for url in self.descobrir_links():
            try:
                texto = texto_principal(self._html(url))
            except Exception as e:
                self.registrar_erro(f"Lote {url}: {e}")
                continue
            h = hashlib.sha1(texto.encode()).hexdigest()
            cache = self._cache(url)
            if cache and cache["hash_texto"] == h:
                extraido = cache["extraido"] or {}
            else:
                if self.chamadas_llm >= limite:
                    self.registrar_erro(f"Limite de {limite} páginas por execução atingido; restante fica para a próxima.")
                    break
                try:
                    extraido = self.extrair_com_llm(texto, url)
                except ErroDeFonte:
                    raise
                except Exception as e:
                    self.registrar_erro(f"LLM em {url}: {e}")
                    continue
                self._salvar_cache(url, h, extraido)
            if not extraido.get("eh_lote_de_imovel"):
                continue
            campos = {k: v for k, v in extraido.items() if k != "eh_lote_de_imovel"}
            campos["dados"] = {"extraido_por": "llm", "modelo": config.modelo_llm}
            lote = self.montar(campos, url=url)
            if lote:
                yield lote
