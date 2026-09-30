"""Cliente HTTP educado: intervalo por domínio, robots.txt, novas tentativas, e navegador opcional."""
from __future__ import annotations

import hashlib
import logging
import time
import urllib.robotparser
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .config import config

log = logging.getLogger(__name__)


class BloqueadoPorRobots(Exception):
    pass


class Cliente:
    def __init__(
        self,
        intervalo: float | None = None,
        respeitar_robots: bool | None = None,
        transport: httpx.BaseTransport | None = None,
        salvar_brutos_em: Path | None = None,
        cabecalhos: dict[str, str] | None = None,
        verificar_tls: bool = True,
    ):
        self.intervalo = config.intervalo_minimo if intervalo is None else intervalo
        self.respeitar_robots = config.respeitar_robots if respeitar_robots is None else respeitar_robots
        self._ultimo: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.salvar_brutos_em = salvar_brutos_em
        self.http = httpx.Client(
            headers={
                "User-Agent": config.user_agent,
                "Accept-Language": "pt-BR,pt;q=0.9",
                **(cabecalhos or {}),
            },
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, connect=15.0),
            transport=transport,
            verify=verificar_tls,
        )

    # ------------------------------------------------------------ utilidades

    def _esperar(self, dominio: str) -> None:
        if self.intervalo <= 0:
            return
        passado = time.monotonic() - self._ultimo.get(dominio, 0)
        if passado < self.intervalo:
            time.sleep(self.intervalo - passado)
        self._ultimo[dominio] = time.monotonic()

    def _pode(self, url: str) -> bool:
        if not self.respeitar_robots:
            return True
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.http.get(f"{base}/robots.txt")
                if r.status_code >= 400:
                    self._robots[base] = None  # sem robots = permitido
                else:
                    rp.parse(r.text.splitlines())
                    self._robots[base] = rp
            except httpx.HTTPError:
                self._robots[base] = None
        rp = self._robots[base]
        return True if rp is None else rp.can_fetch(config.user_agent, url)

    def _salvar(self, url: str, conteudo: bytes, extensao: str) -> None:
        if not self.salvar_brutos_em:
            return
        pasta = self.salvar_brutos_em / date.today().isoformat()
        pasta.mkdir(parents=True, exist_ok=True)
        nome = hashlib.sha1(url.encode()).hexdigest()[:16] + extensao
        (pasta / nome).write_bytes(conteudo)

    # ------------------------------------------------------------ requisições

    def requisitar(self, metodo: str, url: str, tentativas: int = 3, **kwargs) -> httpx.Response:
        if not self._pode(url):
            raise BloqueadoPorRobots(url)
        dominio = urlparse(url).netloc
        espera = 5.0
        for tentativa in range(1, tentativas + 1):
            self._esperar(dominio)
            try:
                r = self.http.request(metodo, url, **kwargs)
                if r.status_code in (429, 500, 502, 503, 504) and tentativa < tentativas:
                    log.warning("HTTP %s em %s, nova tentativa em %.0fs", r.status_code, url, espera)
                    time.sleep(espera)
                    espera *= 2
                    continue
                r.raise_for_status()
                tipo = r.headers.get("content-type", "")
                self._salvar(url, r.content, ".json" if "json" in tipo else ".csv" if "csv" in tipo else ".html")
                return r
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError):
                if tentativa == tentativas:
                    raise
                time.sleep(espera)
                espera *= 2
        raise RuntimeError("inalcançável")

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self.requisitar("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self.requisitar("POST", url, **kwargs)

    def html_navegador(self, url: str, esperar_seletor: str | None = None, espera_ms: int = 1500,
                       timeout_ms: int = 60000) -> str:
        """Abre a página num Chromium headless (para sites que montam o conteúdo com JavaScript)."""
        if not self._pode(url):
            raise BloqueadoPorRobots(url)
        self._esperar(urlparse(url).netloc)
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("Instale o Playwright: pip install playwright && playwright install chromium") from e
        with sync_playwright() as p:
            nav = p.chromium.launch()
            pagina = nav.new_page(user_agent=config.user_agent, locale="pt-BR")
            pagina.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            if esperar_seletor:
                pagina.wait_for_selector(esperar_seletor, timeout=20000)
            else:
                pagina.wait_for_timeout(espera_ms)
            html = pagina.content()
            nav.close()
        self._salvar(url, html.encode(), ".html")
        return html

    def fechar(self) -> None:
        self.http.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.fechar()
