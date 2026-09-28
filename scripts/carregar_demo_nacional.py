"""Carrega ~800 imóveis FICTÍCIOS espalhados pelas 27 capitais, para testar a busca, o mapa e os filtros
com volume parecido com o real. Tudo passa pelo mesmo caminho da coleta real (normalizar → gravar).

    python scripts/carregar_demo_nacional.py            # carrega (roda duas vezes para simular queda de preço)
    python scripts/carregar_demo_nacional.py --limpar   # remove

Fonte: 'demo-nacional'. Nada disto é imóvel de verdade.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterator

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "coletor"))

from coletor.adaptadores import TIPOS  # noqa: E402
from coletor.adaptadores.base import Adaptador  # noqa: E402
from coletor.banco import conectar, migrar  # noqa: E402
from coletor.coleta import executar  # noqa: E402
from coletor.modelos import LoteBruto  # noqa: E402
from coletor.normalizar import FUSO  # noqa: E402

FONTE_ID = "demo-nacional"
N_POR_CAPITAL = 30

CAPITAIS = {
    "AC": ("Rio Branco", -9.97, -67.81), "AL": ("Maceió", -9.65, -35.73), "AP": ("Macapá", 0.03, -51.07),
    "AM": ("Manaus", -3.10, -60.02), "BA": ("Salvador", -12.97, -38.50), "CE": ("Fortaleza", -3.73, -38.53),
    "DF": ("Brasília", -15.79, -47.88), "ES": ("Vitória", -20.31, -40.31), "GO": ("Goiânia", -16.68, -49.25),
    "MA": ("São Luís", -2.53, -44.30), "MT": ("Cuiabá", -15.60, -56.10), "MS": ("Campo Grande", -20.46, -54.62),
    "MG": ("Belo Horizonte", -19.92, -43.94), "PA": ("Belém", -1.46, -48.49), "PB": ("João Pessoa", -7.12, -34.86),
    "PR": ("Curitiba", -25.43, -49.27), "PE": ("Recife", -8.05, -34.88), "PI": ("Teresina", -5.09, -42.80),
    "RJ": ("Rio de Janeiro", -22.91, -43.20), "RN": ("Natal", -5.79, -35.21), "RS": ("Porto Alegre", -30.03, -51.23),
    "RO": ("Porto Velho", -8.76, -63.90), "RR": ("Boa Vista", 2.82, -60.67), "SC": ("Florianópolis", -27.59, -48.55),
    "SP": ("São Paulo", -23.55, -46.63), "SE": ("Aracaju", -10.91, -37.07), "TO": ("Palmas", -10.18, -48.33),
}
BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Setor Sul", "Boa Vista", "Santa Cruz", "Parque das Flores",
           "Bela Vista", "Jardim Europa", "São José"]
VENDEDORES = ["Caixa Econômica Federal"] * 5 + ["Banco do Brasil", "Santander", "Itaú Unibanco", "Bradesco", "Emgea",
                                                 "Poder Judiciário"] * 1
TIPOS_DEMO = [("Apartamento", 60), ("Casa", 25), ("Terreno", 8), ("Sala comercial", 5), ("Galpão", 2)]


def _escolher_tipo(r: random.Random) -> str:
    return r.choices([t for t, _ in TIPOS_DEMO], weights=[p for _, p in TIPOS_DEMO])[0]


class DemoNacional(Adaptador):
    tipo = "demo_nacional"

    def coletar(self) -> Iterator[LoteBruto]:
        rodada = self.fonte.get("rodada", 1)
        agora = datetime.now(FUSO).replace(minute=0, second=0, microsecond=0)
        for uf, (cidade, lat0, lon0) in CAPITAIS.items():
            for k in range(N_POR_CAPITAL):
                r = random.Random(f"{uf}-{k}")  # mesmo imóvel nas duas rodadas
                tipo = _escolher_tipo(r)
                vendedor = "BRB" if uf == "DF" and r.random() < 0.15 else r.choice(VENDEDORES)
                judicial = vendedor == "Poder Judiciário"
                area = round(r.uniform(38, 220) if tipo != "Terreno" else r.uniform(200, 900), 2)
                m2 = r.uniform(3500, 11000) * (1.4 if uf in {"SP", "RJ", "DF"} else 1)
                avaliacao = round(area * m2 / (4 if tipo == "Terreno" else 1), -3)
                desconto = r.choice([0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6])
                lance = round(avaliacao * (1 - desconto), -2)
                baixa = r.random() < 0.12  # sorteado sempre, para não mudar os sorteios seguintes
                if rodada == 2 and baixa:  # alguns baixam de preço na 2ª rodada
                    lance = round(lance * 0.85, -2)
                dias = r.randint(1, 90)
                venda_direta = vendedor == "Caixa Econômica Federal" and r.random() < 0.35
                quartos = r.randint(1, 4) if tipo in {"Apartamento", "Casa"} else None
                frases = [f"{tipo}, {area} de área privativa" + (f", {quartos} qto(s)" if quartos else "")
                          + (f", {r.randint(0, 3)} vaga(s) de garagem" if quartos else "") + "."]
                ocup = r.choice(["Imóvel desocupado.", "Imóvel ocupado.", ""])
                frases.append(ocup)
                frases.append(r.choice([
                    "Débitos de IPTU e condomínio por conta do arrematante.",
                    "Débitos de condomínio e IPTU até a data do leilão são de responsabilidade do vendedor.",
                    "",
                ]))
                if judicial or r.random() < 0.2:
                    frases.append(r.choice(["Admite-se pagamento parcelado (art. 895 do CPC).", "Pagamento somente à vista."]))
                lat = lat0 + r.uniform(-0.12, 0.12)
                lon = lon0 + r.uniform(-0.12, 0.12)
                yield LoteBruto(
                    id_externo=f"{uf}-{k:03d}",
                    url=f"https://exemplo.invalid/demo/{uf}-{k:03d}",
                    titulo=f"{tipo} em {r.choice(BAIRROS)}, {cidade}/{uf} (fictício)",
                    descricao=" ".join(f for f in frases if f),
                    tipo=tipo,
                    modalidade="venda direta" if venda_direta else ("leilão judicial" if judicial else "leilão extrajudicial"),
                    uf=uf, cidade=cidade, bairro=r.choice(BAIRROS),
                    endereco=f"Rua Fictícia {k + 1}, {r.randint(1, 900)}",
                    lat=lat, lon=lon,
                    valor_avaliacao=avaliacao,
                    lance_minimo=lance,
                    praca_atual=None if venda_direta else r.choice([1, 2]),
                    data_praca1=None if venda_direta else (agora + timedelta(days=dias)).isoformat(),
                    data_praca2=None if venda_direta else (agora + timedelta(days=dias + 15)).isoformat(),
                    aceita_financiamento=vendedor != "Poder Judiciário" and r.random() < 0.6,
                    aceita_fgts=vendedor == "Caixa Econômica Federal" and r.random() < 0.7,
                    leiloeiro=None if venda_direta else f"Leiloeiro Demo {chr(65 + k % 6)}",
                    comitente=vendedor,
                    fotos=[] if r.random() < 0.3 else [f"https://picsum.photos/seed/{uf}{k}/480/320"],
                )


def main() -> None:
    TIPOS[DemoNacional.tipo] = DemoNacional
    with conectar() as conn:
        migrar(conn)
        if "--limpar" in sys.argv:
            with conn.cursor() as cur:
                cur.execute("delete from leitura where lote_id in (select id from lote where fonte_id = %s)", (FONTE_ID,))
                cur.execute("create temp table _im as select distinct imovel_id from lote where fonte_id = %s", (FONTE_ID,))
                cur.execute("delete from lote where fonte_id = %s", (FONTE_ID,))
                cur.execute("delete from execucao_coleta where fonte_id = %s", (FONTE_ID,))
                cur.execute("delete from imovel_chave where imovel_id in (select imovel_id from _im)")
                cur.execute("delete from imovel where id in (select imovel_id from _im)")
                cur.execute("delete from fonte where id = %s", (FONTE_ID,))
            conn.commit()
            print("Demonstração nacional removida.")
            return
        for rodada in (1, 2):
            fonte = {"id": FONTE_ID, "nome": "Demonstração nacional (fictício)", "tipo": DemoNacional.tipo,
                     "uf": ["todas"], "rodada": rodada}
            r = executar(fonte, conn)
            print(f"rodada {rodada}: {r.status}, {r.contadores.novos} novos, {r.contadores.alterados} alterados")
    print("Pronto. Abra http://localhost:3000")


if __name__ == "__main__":
    main()
