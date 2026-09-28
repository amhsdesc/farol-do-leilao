"""Linha de comando: python -m coletor <comando>."""
from __future__ import annotations

import argparse
import csv
import logging
import sys
from urllib.parse import urlparse

from . import registro
from .banco import conectar, migrar
from .coleta import executar
from .config import config

CATALOGO = config.pasta_fontes / "catalogo_leiloeiros.csv"


def _tabela(linhas: list[list], cabecalho: list[str]) -> None:
    larg = [max(len(str(x)) for x in col) for col in zip(cabecalho, *linhas)] if linhas else [len(c) for c in cabecalho]
    fmt = "  ".join(f"{{:<{w}}}" for w in larg)
    print(fmt.format(*cabecalho))
    print("  ".join("-" * w for w in larg))
    for l in linhas:
        print(fmt.format(*[str(x) for x in l]))


def cmd_migrar(_):
    with conectar() as conn:
        feitas = migrar(conn)
    print("Migrações aplicadas:", ", ".join(feitas) if feitas else "nenhuma (banco já atualizado)")


def cmd_fontes(_):
    fontes = registro.carregar()
    status = {}
    try:
        with conectar() as conn, conn.cursor() as cur:
            cur.execute("""
                select f.id,
                       (select count(*) from lote l where l.fonte_id = f.id and l.status in ('ativo','suspenso')) ativos,
                       (select e.status || ' em ' || to_char(e.iniciada_em, 'DD/MM HH24:MI')
                          from execucao_coleta e where e.fonte_id = f.id order by e.id desc limit 1) ultima
                from fonte f""")
            status = {r["id"]: r for r in cur.fetchall()}
    except Exception as e:
        print(f"(banco indisponível: {e})\n")
    linhas = [[f["id"], f["tipo"], ",".join(f.get("uf", [])), "sim" if f.get("ativa") else "não",
               status.get(f["id"], {}).get("ativos", "-"), status.get(f["id"], {}).get("ultima") or "-"]
              for f in fontes.values()]
    _tabela(linhas, ["fonte", "tipo", "uf", "ativa", "lotes ativos", "última coleta"])


def cmd_coletar(a):
    fontes = registro.carregar()
    if a.todas:
        alvo = [f for f in fontes.values() if f.get("ativa")]
    elif a.tipo:
        alvo = [f for f in fontes.values() if f.get("ativa") and f["tipo"] == a.tipo]
    else:
        faltando = [i for i in a.ids if i not in fontes]
        if faltando or not a.ids:
            sys.exit(f"Fonte(s) desconhecida(s): {', '.join(faltando) or '(nenhuma informada)'}. Veja: python -m coletor fontes")
        alvo = [fontes[i] for i in a.ids]
    with conectar() as conn:
        migrar(conn)
        for f in alvo:
            print(f"→ {f['id']} ({f['tipo']})...", flush=True)
            r = executar(f, conn)
            c = r.contadores
            print(f"  {r.status}: {c.lidos} lidos, {c.novos} novos, {c.alterados} alterados, "
                  f"{c.removidos} removidos, {c.erros} avisos em {r.segundos:.0f}s")
            if r.mensagem:
                print(f"  {r.mensagem[:500]}")


def cmd_inspecionar(a):
    from .inspecionar import inspecionar
    rel = inspecionar(a.url, usar_navegador=not a.sem_navegador)
    print(f"Plataforma: {', '.join(rel.plataformas) or 'não identificada'}")
    print(f"Links com cara de lote: {len(rel.links_lote)}")
    for l in rel.links_lote[:10]:
        print("  ", l)
    if rel.respostas_json:
        print("Respostas JSON (melhores candidatas a json_api primeiro):")
        for r in rel.respostas_json[:8]:
            print(f"   [{r['pontos']:>3} pts] {r['metodo']} {r['url'][:120]}  → {r['arquivo']}")
    print(f"Amostras salvas em: {rel.pasta}")


def cmd_nova_fonte(a):
    from .inspecionar import nova_fonte
    arq = nova_fonte(a.url, [u.upper() for u in a.uf], a.nome)
    print(f"Criado: {arq}")


def importar_catalogo(arquivo: str, uf: str | None, junta: str | None) -> int:
    """Importa a relação oficial de leiloeiros de uma junta comercial (CSV) para o catálogo.

    Aceita qualquer CSV com colunas de nome e site (nomes flexíveis). Ex.: dados.df.gov.br,
    dataset "Relação de Leiloeiros Habilitados".
    """
    from .adaptadores.caixa_csv import decodificar
    from .normalizar import simplificar

    texto = decodificar(open(arquivo, "rb").read())
    dialeto = csv.Sniffer().sniff(texto[:5000], delimiters=";,\t")
    linhas = list(csv.DictReader(texto.splitlines(), dialect=dialeto))
    if not linhas:
        return 0

    def coluna(*pistas):
        for c in linhas[0].keys():
            if any(p in simplificar(c) for p in pistas):
                return c
        return None

    c_nome = coluna("nome", "leiloeiro")
    c_site = coluna("site", "sitio", "endereco eletronico", "url", "pagina")
    c_uf = coluna("uf")
    if not c_nome:
        sys.exit(f"Não achei a coluna de nome em {arquivo}. Colunas: {list(linhas[0])}")
    with CATALOGO.open(encoding="utf-8") as fh:
        existentes = {simplificar(l["nome"]) for l in csv.DictReader(fh)}
    novos = 0
    with CATALOGO.open("a", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        for l in linhas:
            nome = (l.get(c_nome) or "").strip()
            if not nome or simplificar(nome) in existentes:
                continue
            site = (l.get(c_site) or "").strip() if c_site else ""
            if site and not site.startswith("http"):
                site = "https://" + site.lstrip("/")
            w.writerow([nome, site, (l.get(c_uf) if c_uf else None) or uf or "", junta or "", "", "a_mapear", "importado"])
            existentes.add(simplificar(nome))
            novos += 1
    return novos


def cmd_catalogo(a):
    """Cobertura: quantos leiloeiros do catálogo já têm fonte. --criar-fontes gera YAML automático para os demais."""
    from .inspecionar import nova_fonte, slug
    if not CATALOGO.exists():
        sys.exit(f"Catálogo não encontrado: {CATALOGO}")
    if a.importar:
        n = importar_catalogo(a.importar, a.uf, a.junta)
        print(f"{n} leiloeiro(s) novo(s) adicionados ao catálogo a partir de {a.importar}")
    fontes = registro.carregar()
    dominios = {urlparse(f.get("site") or "").netloc.replace("www.", "") for f in fontes.values()}
    with CATALOGO.open(encoding="utf-8") as fh:
        linhas = list(csv.DictReader(fh))
    cobertos = [l for l in linhas if urlparse(l.get("site") or "").netloc.replace("www.", "") in dominios]
    pendentes = [l for l in linhas if l not in cobertos and l.get("site") and l.get("status") not in ("sem_imoveis", "bloqueado")]
    print(f"Catálogo: {len(linhas)} leiloeiros | com fonte: {len(cobertos)} | a mapear: {len(pendentes)} | "
          f"sem site: {sum(1 for l in linhas if not l.get('site'))}")
    if a.criar_fontes:
        criadas = 0
        for l in pendentes:
            ufs = [u.strip().upper() for u in (l.get("uf") or "").split("|") if u.strip()]
            try:
                nova_fonte(l["site"], ufs or ["DF"], l.get("nome"))
                criadas += 1
            except FileExistsError:
                pass
        print(f"{criadas} fonte(s) automática(s) criada(s) em fontes/leiloeiros/. Teste com: python -m coletor coletar --tipo automatico")


def cmd_geocodificar(a):
    from .geocodificar import Geocodificador
    with conectar() as conn:
        r = Geocodificador(conn).executar(a.limite)
    print(f"No endereço: {r['endereco']} | no bairro: {r['bairro']} | na cidade: {r['cidade']} | sem resultado: {r['falhou']}")


def cmd_status(_):
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""select
            (select count(*) from fonte where ativa) fontes,
            (select count(*) from lote where status in ('ativo','suspenso')) lotes_ativos,
            (select count(*) from vw_busca) imoveis_ativos,
            (select count(*) from vw_busca where lat is not null) no_mapa,
            (select count(*) from leitura) leituras""")
        r = cur.fetchone()
    print(f"Fontes ativas: {r['fontes']} | lotes ativos: {r['lotes_ativos']} | imóveis únicos: {r['imoveis_ativos']} "
          f"(no mapa: {r['no_mapa']}) | leituras no histórico: {r['leituras']}")


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="coletor", description="Coletor do agregador Hasta")
    sub = p.add_subparsers(dest="comando", required=True)
    sub.add_parser("migrar", help="cria/atualiza as tabelas do banco").set_defaults(f=cmd_migrar)
    sub.add_parser("fontes", help="lista as fontes e o estado de cada uma").set_defaults(f=cmd_fontes)
    s = sub.add_parser("coletar", help="coleta uma ou mais fontes")
    s.add_argument("ids", nargs="*")
    s.add_argument("--todas", action="store_true")
    s.add_argument("--tipo", help="só fontes deste tipo de adaptador")
    s.set_defaults(f=cmd_coletar)
    s = sub.add_parser("inspecionar", help="analisa um site para decidir como coletar")
    s.add_argument("url")
    s.add_argument("--sem-navegador", action="store_true")
    s.set_defaults(f=cmd_inspecionar)
    s = sub.add_parser("nova-fonte", help="cria YAML automático para um site")
    s.add_argument("url")
    s.add_argument("--uf", nargs="+", default=["DF"])
    s.add_argument("--nome")
    s.set_defaults(f=cmd_nova_fonte)
    s = sub.add_parser("catalogo", help="cobertura do catálogo de leiloeiros")
    s.add_argument("--criar-fontes", action="store_true", help="cria YAML automático para cada leiloeiro sem fonte")
    s.add_argument("--importar", metavar="CSV", help="importa a relação de leiloeiros de uma junta comercial")
    s.add_argument("--uf", help="UF dos leiloeiros importados (se o CSV não tiver)")
    s.add_argument("--junta", help="nome da junta (ex.: JUCIS-DF)")
    s.set_defaults(f=cmd_catalogo)
    s = sub.add_parser("geocodificar", help="põe no mapa os imóveis sem coordenada")
    s.add_argument("--limite", type=int, default=500)
    s.set_defaults(f=cmd_geocodificar)
    sub.add_parser("status", help="números gerais da base").set_defaults(f=cmd_status)
    a = p.parse_args(argv)
    a.f(a)


if __name__ == "__main__":
    main()
