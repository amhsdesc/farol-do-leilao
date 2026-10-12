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
import os
import re
from typing import Any, Iterator
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from psycopg.types.json import Jsonb

from ..config import config
from ..modelos import LoteBruto
from . import estruturado
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


_CONTADOR = re.compile(
    r"visualiza|\bvisitas?\b|visitantes|acessos|pessoas habilitadas|n[úu]mero de (?:visitas|lances)|"
    r"finalizando em|termina em|encerra em|tempo restante|resta\(m\)|restam|faltam|"
    r"\b(?:dia|hora|minuto|segundo)\(s\)|\d+\s*dias?,\s*\d+\s*h|\bsem lance\b|nenhum lance|maior lance atual|[úu]ltimo lance",
    re.I,
)
_SO_NUMERO = re.compile(r"^[\d.,\sR$]*$")  # sem "/" nem ":" → nunca engole uma data ou hora
_TEM_DATA = re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}")


_GOTO = re.compile(r"""goTo\(\s*['"]([^'"]+)['"]""")


def _hrefs(sopa) -> list[str]:
    """href dos <a> + destinos de onClick="goTo('pagina.php?...')" (sites que navegam por JavaScript)."""
    out = [a["href"] for a in sopa.select("a[href]")]
    for el in sopa.select("[onclick]"):
        m = _GOTO.search(el.get("onclick") or "")
        if m:
            out.append(m.group(1))
    return out


def texto_estavel(texto: str) -> str:
    """Texto sem contadores que mudam sozinhos (visitas, tempo restante, lances), só para comparar com o cache.

    Sem isso, o contador de visitas muda o texto a cada coleta e a IA releria a página à toa. Não afeta o que é enviado
    à IA: serve apenas para o hash.
    """
    saida: list[str] = []
    pular = False
    for linha in texto.splitlines():
        l = linha.strip()
        if pular and l and _SO_NUMERO.match(l):  # valor na linha seguinte ao rótulo do contador
            pular = False
            continue
        pular = False
        if l and len(l) < 80 and _CONTADOR.search(l) and not _TEM_DATA.search(l):  # linha com data nunca é só contador
            pular = True
            continue
        saida.append(linha)
    return "\n".join(saida)


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
        self.lidos_sem_ia = 0
        self.url_final = ""
        self.motivos_ia: list[tuple[str, str]] = []

    # ------------------------------------------------------------ navegação

    def _html(self, url: str) -> str:
        if self.fonte.get("navegador"):
            self.url_final = url
            return self.cliente.html_navegador(url)
        r = self.cliente.get(url)
        self.url_final = str(r.url)  # depois dos redirecionamentos
        return r.text

    def _foi_para_home(self, url: str) -> bool:
        """Link de lote que redireciona para a página inicial = lote que saiu do ar; não vale gastar IA lendo a home."""
        fim = urlparse(self.url_final or url).path
        return fim in ("", "/") and urlparse(url).path not in ("", "/")

    def descobrir_links(self) -> list[str]:
        if self.fonte.get("descoberta"):  # sites que listam por JavaScript: função própria (adaptadores/descobertas.py)
            from .descobertas import DESCOBERTAS
            achados = DESCOBERTAS[self.fonte["descoberta"]](self)
            return achados[: int(self.fonte.get("max_lotes", 300))]
        inicio = self.fonte.get("inicio") or []
        if isinstance(inicio, str):
            inicio = [inicio]
        if not inicio:
            raise ErroDeFonte("Informe 'inicio' (URLs da listagem de imóveis) no YAML.")
        dominio = urlparse(inicio[0]).netloc
        padrao = re.compile(self.fonte["padrao_link_lote"], re.I) if self.fonte.get("padrao_link_lote") else HEURISTICA_LOTE
        lista = re.compile(self.fonte["padrao_link_lista"], re.I) if self.fonte.get("padrao_link_lista") else None
        exp = self.fonte.get("expandir_eventos") or {}
        exp_padrao = re.compile(exp["padrao"], re.I) if exp.get("padrao") else None
        fila, visitadas, lotes, expandidos = list(inicio), set(), [], set()
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
            # o site pode ter mudado de domínio (redirecionamento): os links valem a partir do endereço FINAL
            base = self.url_final or url
            dominios = {dominio, urlparse(base).netloc}
            novos_eventos: list[str] = []
            for bruto in _hrefs(sopa):
                href = urljoin(base, bruto).split("#")[0]
                if urlparse(href).netloc not in dominios:
                    continue
                if exp_padrao and exp_padrao.search(href):
                    if href not in expandidos:
                        expandidos.add(href)
                        novos_eventos.append(href)
                elif padrao.search(href) and href not in lotes:
                    lotes.append(href)
                elif ((lista and lista.search(href)) or HEURISTICA_PAGINACAO.search(href)) and href not in visitadas and href not in fila:
                    fila.append(href)
            for ev in novos_eventos:
                for l in self._lotes_do_evento(ev, exp, base):
                    if l not in lotes:
                        lotes.append(l)
        return lotes[: int(self.fonte.get("max_lotes", 300))]

    def _lotes_do_evento(self, evento: str, exp: dict, base: str) -> list[str]:
        """Eventos cujos lotes são carregados por JavaScript: chama o endereço interno que devolve a lista (em páginas)."""
        m = re.search(exp["padrao"], evento, re.I)
        if not m or not m.groups():
            return []
        tamanho = int(exp.get("tamanho", 36))
        achados: list[str] = []
        guardado = self.url_final
        try:
            for pagina in range(int(exp.get("paginas_max", 30))):
                url = exp["url"].format(id=m.group(1), inicio=pagina * tamanho, pagina=pagina, venda_direta="True" if "venda-direta" in evento.lower() else "False")
                try:
                    sopa = BeautifulSoup(self._html(url), "lxml")
                except Exception as e:
                    self.registrar_erro(f"Evento {evento}: {e}")
                    break
                novos = [urljoin(base, a["href"]).split("#")[0] for a in sopa.select("a[href]") if re.search(exp["padrao_lote"], a["href"], re.I)]
                novos = [n for n in dict.fromkeys(novos) if n not in achados]
                if not novos:
                    break
                achados += novos
                if len(novos) < tamanho and not exp.get("sempre_paginar"):
                    break
        finally:
            self.url_final = guardado
        return achados

    # ------------------------------------------------------------ cache e LLM

    def _cache(self, url: str) -> dict | None:
        if not self.conn:
            return None
        with self.conn.cursor() as cur:
            cur.execute("select hash_texto, extraido from pagina_cache where url = %s", (url,))
            r = cur.fetchone()
        # fecha a transação de leitura: o que vem a seguir (baixar a página, chamar a IA) pode
        # demorar, e o Postgres derruba uma conexão parada em transação aberta por muito tempo.
        self.conn.rollback()
        return r

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

    def _cache_revisao(self, url: str) -> dict | None:
        """Como _cache, mas devolve também `recente`: a página foi lida há menos de N dias E não é urgente.

        Urgente (sempre confere o texto): lote com leilão nos próximos 7 dias (ou ocorrido há menos de 1 dia),
        ou imóvel que alguém acompanha com alerta. Assim o site e os alertas de preço/data/suspensão não atrasam,
        e só as páginas "tranquilas" esperam `cache_revisao_dias` antes de a IA reler (poupa o custo de páginas
        que mudam por motivos irrelevantes: contador de visitas, tempo restante...).
        """
        if not self.conn:
            return None
        with self.conn.cursor() as cur:
            cur.execute(
                """select c.hash_texto, c.extraido,
                          ((now() - c.atualizado_em) < make_interval(days => %s)
                           and not exists (
                               select 1 from lote l
                               where l.url = c.url and l.status in ('ativo', 'suspenso')
                                 and (l.data_praca1 between now() - interval '1 day' and now() + interval '7 days'
                                   or l.data_praca2 between now() - interval '1 day' and now() + interval '7 days'
                                   or exists (select 1 from alerta a where a.imovel_id = l.imovel_id and a.tipo = 'imovel' and a.ativo))
                           )) as recente
                   from pagina_cache c where c.url = %s""",
                (config.cache_revisao_dias, url),
            )
            r = cur.fetchone()
        self.conn.rollback()  # fecha a transação de leitura (a IA pode demorar e o Postgres derruba conexão parada)
        return r

    def _reservar_chamada_global(self) -> bool:
        """Teto diário compartilhado por todas as fontes (cada fonte roda num processo próprio, então o contador fica no banco).

        Atômico: duas fontes ao mesmo tempo não passam do teto. Sem banco (testes, uso avulso), não há teto global.
        O dia vale no fuso de São Paulo. O limite em uso é o da tabela llm_orcamento; se ela estiver vazia, o padrão da config.
        """
        if not self.conn:
            return True
        with self.conn.cursor() as cur:
            cur.execute("select max_chamadas_dia from llm_orcamento where nome = 'coletor'")
            linha = cur.fetchone()
            teto = int(linha["max_chamadas_dia"]) if linha else config.llm_max_chamadas_dia
            if teto <= 0:
                self.conn.rollback()
                return False
            cur.execute(
                """insert into llm_uso_coletor (dia, chamadas) values ((now() at time zone 'America/Sao_Paulo')::date, 1)
                   on conflict (dia) do update set chamadas = llm_uso_coletor.chamadas + 1
                   where llm_uso_coletor.chamadas < %s
                   returning chamadas""",
                (teto,),
            )
            ok = cur.fetchone() is not None
            if ok:  # contabilidade por fonte: mostra de onde vem o gasto
                cur.execute(
                    """insert into llm_uso_fonte (dia, fonte_id, chamadas)
                       values ((now() at time zone 'America/Sao_Paulo')::date, %s, 1)
                       on conflict (dia, fonte_id) do update set chamadas = llm_uso_fonte.chamadas + 1""",
                    (self.fonte["id"],),
                )
        self.conn.commit()
        return ok

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

    def _tentar_preset(self) -> list[LoteBruto]:
        """Sites de plataformas conhecidas (ex.: leilao.pro) são lidos por seletores, sem IA."""
        from . import plataformas
        from .seletores import Seletores
        inicio = self.fonte.get("inicio") or []
        url = inicio if isinstance(inicio, str) else (inicio[0] if inicio else None)
        if not url or self.fonte.get("sem_preset"):
            return []
        try:
            nome = plataformas.detectar(self._html(url))
            if not nome:
                return []
            if nome in plataformas.ADAPTADORES:
                from .suaplataforma import SuaPlataforma
                sub = SuaPlataforma({**self.fonte, "site": url}, self.cliente, self.conn)
            else:
                sub = Seletores(plataformas.fonte_do_preset(self.fonte, nome, url), self.cliente, self.conn)
            lotes = list(sub.coletar())
            self.erros.extend(sub.erros)
            return lotes
        except Exception as e:
            self.registrar_erro(f"Preset de plataforma falhou ({e}); usando leitura padrão.")
            return []

    def testar_sem_ia(self, maximo: int = 10) -> tuple[list[LoteBruto], dict[str, int]]:
        """Para o comando `testar`: acha os links de lote e tenta só a leitura sem IA (JSON embutido). Não grava nada."""
        links = self.descobrir_links()
        stats = {"links": len(links), "lidos": 0, "nao_imovel": 0, "precisaria_ia": 0, "erro": 0}
        lotes: list[LoteBruto] = []
        for url in links[:maximo]:
            if estruturado.pagina_de_evento(url):
                stats["evento"] = stats.get("evento", 0) + 1
                continue
            try:
                html = self._html(url)
                if self._foi_para_home(url):
                    stats["fora_do_ar"] = stats.get("fora_do_ar", 0) + 1
                    continue
                lido, motivo = estruturado.ler_com_motivo(html, texto_principal(html), url)
            except Exception:
                stats["erro"] += 1
                continue
            if lido is estruturado.NAO_IMOVEL:
                stats["nao_imovel"] += 1
            elif lido:
                lote = self.montar(lido, url=self.url_final or url)
                if lote:
                    lotes.append(lote)
                    stats["lidos"] += 1
            else:
                stats["precisaria_ia"] += 1
                self.motivos_ia.append((url, motivo))
        return lotes, stats

    def coletar(self) -> Iterator[LoteBruto]:
        pre = self._tentar_preset()
        if pre:
            yield from pre
            return
        limite = config.llm_max_paginas_por_execucao
        for url in self.descobrir_links():
            if not os.getenv("COLETOR_SEM_ESTRUTURADO") and estruturado.pagina_de_evento(url):
                continue  # evento/redirecionamento: não é lote, não gasta IA
            try:
                html = self._html(url)
                texto = texto_principal(html)
            except Exception as e:
                self.registrar_erro(f"Lote {url}: {e}")
                continue
            if self._foi_para_home(url):
                continue  # o link cai na página inicial: o lote saiu do ar
            if not os.getenv("COLETOR_SEM_ESTRUTURADO"):  # leitura sem IA (JSON embutido na página)
                lido = estruturado.ler(html, texto, url)
                if lido is estruturado.NAO_IMOVEL:
                    continue
                if lido:
                    lote = self.montar(lido, url=self.url_final or url)
                    if lote:
                        self.lidos_sem_ia += 1
                        yield lote
                    continue
            h = hashlib.sha1(texto_estavel(texto).encode()).hexdigest()  # sem contadores de visita/tempo
            cache = self._cache_revisao(url)
            # reaproveita se o texto é o mesmo OU se a página é "tranquila" e foi lida há pouco (ver _cache_revisao)
            if cache and (cache["hash_texto"] == h or cache["recente"]):
                extraido = cache["extraido"] or {}
            else:
                if self.chamadas_llm >= limite:
                    self.registrar_erro(f"Limite de {limite} páginas por execução atingido; restante fica para a próxima.")
                    break
                if not self._reservar_chamada_global():
                    self.registrar_erro("Teto diário de chamadas de IA do coletor atingido; o restante fica para a próxima coleta.")
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
