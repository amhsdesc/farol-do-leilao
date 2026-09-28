from .automatico import Automatico
from .base import Adaptador, ErroDeFonte
from .caixa_csv import CaixaCSV
from .json_api import JsonApi
from .seletores import Seletores

TIPOS: dict[str, type[Adaptador]] = {
    CaixaCSV.tipo: CaixaCSV,
    JsonApi.tipo: JsonApi,
    Seletores.tipo: Seletores,
    Automatico.tipo: Automatico,
}

__all__ = ["TIPOS", "Adaptador", "ErroDeFonte", "CaixaCSV", "JsonApi", "Seletores", "Automatico"]
