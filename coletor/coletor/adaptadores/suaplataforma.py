"""Plataforma "suaplataformadeleilao" (ACT Leilões e ~12 outros leiloeiros): lê a API JSON do próprio site.

O site chama `POST /ApiEngine/GetBusca/{pagina}/1/0` com um JSON de filtros; sem filtros ele devolve todos os
lotes, já com endereço, cidade, UF, avaliação, lance mínimo por praça e datas. Sem navegador e sem IA.
"""
from __future__ import annotations

from typing import Any, Iterator

from ..modelos import LoteBruto
from ..normalizar import tipo as normalizar_tipo
from .base import Adaptador, ErroDeFonte

PARAMS = {
    "Bairro": "", "Busca": "", "BuscaProcesso": "", "CFGs": "", "CodLeilao": "", "DataAbertura": "",
    "DataEncerramento": "", "ID_Categoria": 0, "ID_Cidade": 0, "ID_Estado": 0, "ID_Leiloes_Status": [],
    "ID_Regiao": 0, "IgnoreScopo": 0, "Mapa": "", "NomesPartes": "", "OrdSt": 0, "Ordem": 0,
    "OrientacaoBusca": 1, "PaginaIndex": 1, "PracaAtual": 0, "RangeValores": 0, "Scopo": 0, "SubStatus": [],
    "TiposLeiloes": [], "ValorMaxSelecionado": 0, "ValorMinSelecionado": 0, "sInL": "",
}


def _data(v: Any) -> str | None:
    if not v or str(v).startswith(("1900", "0001")):
        return None
    return str(v).replace("T", " ")[:19]


class SuaPlataforma(Adaptador):
    tipo = "suaplataforma"

    def _base(self) -> str:
        site = self.fonte.get("api_base") or self.fonte.get("site") or ""
        inicio = self.fonte.get("inicio") or []
        if not site and inicio:
            site = inicio if isinstance(inicio, str) else inicio[0]
        from urllib.parse import urlparse
        u = urlparse(site)
        if not u.netloc:
            raise ErroDeFonte("Informe 'site' no YAML.")
        return f"{u.scheme}://{u.netloc}"

    def converter(self, lote: dict[str, Any], base: str) -> dict[str, Any] | None:
        rt = (lote.get("GetLoteRealTime") or [{}])[0]
        if normalizar_tipo(lote.get("Categoria"), lote.get("IconeCategoria"), lote.get("Leilao"),
                           lote.get("Lote_Complemento")) == "outros":
            return None  # veículo, máquina, etc.
        praca = int(rt.get("PracaAtual") or lote.get("PracaAtual") or 1)
        lance = rt.get(["", "ValorMinimoLancePrimeiraPraca", "ValorMinimoLanceSegundaPraca",
                        "ValorMinimoLanceTerceiraPraca"][min(max(praca, 1), 3)]) or rt.get("ProximoLance")
        rua = " ".join(str(x) for x in (lote.get("Lote_Endereco"), lote.get("Lote_Numero")) if x)
        fotos = [f"{base}/imagens-center/350x282/{f['Foto']}" for f in (lote.get("Fotos") or []) if f.get("Foto")]
        return {
            "id_externo": f"{lote.get('ID_Leilao')}-{lote.get('ID_Leiloes_Lote')}",
            "url": f"{base}/{str(lote.get('URLlote') or '').lstrip('/')}",
            "titulo": (lote.get("Leilao") or "").strip(),
            "tipo": lote.get("Categoria"),
            "modalidade": lote.get("LabelModalidade"),
            "comitente": lote.get("Comitente") or None,
            "endereco": rua or None,
            "bairro": lote.get("Lote_Bairro") or None,
            "cidade": lote.get("Cidade") or None,
            "uf": lote.get("UF") or None,
            "cep": lote.get("Lote_CEP") or None,
            "valor_avaliacao": lote.get("ValorAvaliacao") or rt.get("ValorAvaliacao") or None,
            "lance_minimo": lance or None,
            "valor_praca1": rt.get("ValorMinimoLancePrimeiraPraca") or None,
            "valor_praca2": rt.get("ValorMinimoLanceSegundaPraca") or None,
            "data_praca1": _data(rt.get("DataHoraEncerramentoPrimeiraPraca") or rt.get("DataHoraAberturaPrimeiraPraca")),
            "data_praca2": _data(rt.get("DataHoraEncerramentoSegundaPraca")),
            "status": rt.get("StatusLote") or None,
            "numero_processo": lote.get("NumeroProcesso") or None,
            "fotos": fotos,
        }

    def coletar(self) -> Iterator[LoteBruto]:
        base = self._base()
        self.cliente.get(base + "/")  # cookie XSRF-TOKEN
        token = self.cliente.http.cookies.get("XSRF-TOKEN")
        headers = {"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json; charset=utf-8"}
        if token:
            headers["__RVT"] = token
        vistos: set[str] = set()
        for pagina in range(1, int(self.fonte.get("paginas_max", 40)) + 1):
            try:
                r = self.cliente.post(f"{base}/ApiEngine/GetBusca/{pagina}/1/0", headers=headers,
                                      json={**PARAMS, "Pagina": pagina, "QtdPorPagina": 50})
                dados = r.json()
            except Exception as e:
                self.registrar_erro(f"Página {pagina}: {e}")
                break
            lotes = dados.get("Lotes") or []
            novos = 0
            for l in lotes:
                campos = self.converter(l, base)
                if not campos or campos["id_externo"] in vistos:
                    continue
                vistos.add(campos["id_externo"])
                novos += 1
                lote = self.montar({k: v for k, v in campos.items() if v not in (None, "", [])})
                if lote:
                    yield lote
            if not lotes or pagina >= int(dados.get("PageIndexMax") or 1):
                break
