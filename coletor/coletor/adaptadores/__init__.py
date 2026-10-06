from .automatico import Automatico
from .base import Adaptador, ErroDeFonte
from .caixa_csv import CaixaCSV
from .json_api import JsonApi
from .post_html import PostHtml
from .seletores import Seletores
from .suaplataforma import SuaPlataforma
from .wordpress_rest import WordpressRest

TIPOS: dict[str, type[Adaptador]] = {
    CaixaCSV.tipo: CaixaCSV,
    JsonApi.tipo: JsonApi,
    Seletores.tipo: Seletores,
    Automatico.tipo: Automatico,
    PostHtml.tipo: PostHtml,
    WordpressRest.tipo: WordpressRest,
    SuaPlataforma.tipo: SuaPlataforma,
}

__all__ = ["TIPOS", "Adaptador", "ErroDeFonte", "CaixaCSV", "JsonApi", "Seletores", "Automatico", "PostHtml", "WordpressRest"]
