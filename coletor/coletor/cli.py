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


def cmd_catalogo(a):
    """Catálogo de cobertura: leiloeiros validados, comitentes (bancos/órgãos) e fontes oficiais."""
    from datetime import date
    from pathlib import Path

    from . import catalogo as cat
    from .http import Cliente

    leiloeiros = cat.ler(cat.ARQ_LEILOEIROS, cat.COL_LEILOEIROS)
    comitentes = cat.ler(cat.ARQ_COMITENTES, cat.COL_COMITENTES)
    falsos = {f["dominio"] for f in cat.ler(cat.ARQ_FALSOS, cat.COL_FALSOS)}
    ids_fontes = set(registro.carregar())
    acao = a.acao

    if acao == "importar":
        regs = cat.ler_lista_oficial(Path(a.arquivo))
        r = cat.importar_lista_oficial(regs, a.junta, (a.uf or "").upper(), leiloeiros)
        oficiais = cat.ler(cat.ARQ_OFICIAIS, cat.COL_OFICIAIS)
        for o in oficiais:
            if o["nome"] == a.junta:
                o["importado_em"] = date.today().isoformat()
        cat.gravar(cat.ARQ_OFICIAIS, oficiais, cat.COL_OFICIAIS)
        cat.gravar(cat.ARQ_LEILOEIROS, leiloeiros, cat.COL_LEILOEIROS)
        print(f"{r.lidos} registros lidos de {a.arquivo}: {r.validados_existentes} já no catálogo (agora validados), "
              f"{r.novos} novos. Próximo passo: python -m coletor catalogo verificar")
    elif acao == "sites-falsos":
        novos = {cat.dominio(l.strip()) for l in Path(a.arquivo).read_text(encoding="utf-8").splitlines() if l.strip()}
        linhas = cat.ler(cat.ARQ_FALSOS, cat.COL_FALSOS)
        hoje = date.today().isoformat()
        for d in sorted(novos - falsos):
            linhas.append({"dominio": d, "fonte": a.fonte or Path(a.arquivo).name, "incluido_em": hoje})
        cat.gravar(cat.ARQ_FALSOS, linhas, cat.COL_FALSOS)
        marcados = cat.aplicar_sites_falsos(leiloeiros, falsos | novos)
        cat.gravar(cat.ARQ_LEILOEIROS, leiloeiros, cat.COL_LEILOEIROS)
        print(f"{len(novos - falsos)} domínio(s) adicionados à lista de sites falsos; {len(marcados)} leiloeiro(s) marcados como suspeitos.")
    elif acao == "verificar":
        with Cliente(intervalo=1) as cli:
            feitos = cat.verificar_sites(leiloeiros, cli, limite=a.limite, todos=a.todos, falsos=falsos)
        cat.gravar(cat.ARQ_LEILOEIROS, leiloeiros, cat.COL_LEILOEIROS)
        for id_, v in feitos:
            print(f"  {id_:<32} {'no ar' if v.no_ar else 'FORA DO AR':<10} imóveis: {v.faz_imoveis:<11} "
                  f"plataforma: {v.plataforma or '-':<10} ({v.detalhe})")
        print(f"{len(feitos)} site(s) verificados.")
    elif acao == "criar-fontes":
        criados = cat.criar_fontes(leiloeiros, ids_fontes, config.pasta_fontes, incluir_pendentes=a.incluir_pendentes)
        cat.gravar(cat.ARQ_LEILOEIROS, leiloeiros, cat.COL_LEILOEIROS)
        print(f"{len(criados)} fonte(s) criada(s) em fontes/leiloeiros/: {', '.join(criados) or '-'}")
    elif acao == "oficiais":
        linhas = [[o["tipo"], o["nome"], o["uf"], o["importado_em"] or "-", o["url"][:70]]
                  for o in cat.ler(cat.ARQ_OFICIAIS, cat.COL_OFICIAIS)]
        _tabela(linhas, ["tipo", "fonte oficial", "uf", "importado em", "url"])
    else:  # cobertura
        c = cat.cobertura(leiloeiros, comitentes, ids_fontes)
        print(f"Leiloeiros no catálogo: {c['leiloeiros']} | validados: {c['validados']} | pendentes: {c['pendentes']} "
              f"| suspeitos: {c['suspeitos']}")
        print(f"Trabalham com imóveis: {c['fazem_imoveis']} | a verificar: {c['a_verificar']} | com fonte ativa: {c['com_fonte']}")
        print(f"Comitentes (bancos/órgãos): {c['comitentes']} | com fonte própria: {c['comitentes_com_fonte']}")
        if c["imoveis_sem_fonte"]:
            print(f"Fazem imóveis e ainda sem fonte ({len(c['imoveis_sem_fonte'])}): {', '.join(c['imoveis_sem_fonte'][:15])}")
        _tabela([[uf, d["leiloeiros"], d["imoveis"], d["com_fonte"]] for uf, d in c["por_uf"].items()],
                ["uf", "leiloeiros", "fazem imóveis", "com fonte"])


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
    s = sub.add_parser("catalogo", help="cobertura: leiloeiros validados, bancos e fontes oficiais")
    cs = s.add_subparsers(dest="acao")
    cs.add_parser("cobertura", help="resumo da cobertura (padrão)")
    cs.add_parser("oficiais", help="lista as fontes oficiais de leiloeiros (juntas, tribunais)")
    x = cs.add_parser("importar", help="importa lista oficial de leiloeiros (CSV, XLSX ou PDF)")
    x.add_argument("arquivo")
    x.add_argument("--junta", required=True, help="ex.: JUCIS-DF, JUCESP, TJRJ")
    x.add_argument("--uf", help="UF da lista, se o arquivo não tiver")
    x = cs.add_parser("sites-falsos", help="importa domínios denunciados como golpe (um por linha)")
    x.add_argument("arquivo")
    x.add_argument("--fonte", help="de onde veio a lista (ex.: FENALEI)")
    x = cs.add_parser("verificar", help="abre o site de cada leiloeiro: no ar? faz imóveis? plataforma?")
    x.add_argument("--limite", type=int, default=50)
    x.add_argument("--todos", action="store_true", help="reverifica também os já verificados")
    x = cs.add_parser("criar-fontes", help="cria YAML para leiloeiros que fazem imóveis e ainda não têm fonte")
    x.add_argument("--incluir-pendentes", action="store_true", help="inclui os ainda não validados em lista oficial")
    s.set_defaults(f=cmd_catalogo, acao="cobertura")
    s = sub.add_parser("geocodificar", help="põe no mapa os imóveis sem coordenada")
    s.add_argument("--limite", type=int, default=500)
    s.set_defaults(f=cmd_geocodificar)
    sub.add_parser("status", help="números gerais da base").set_defaults(f=cmd_status)
    a = p.parse_args(argv)
    a.f(a)


if __name__ == "__main__":
    main()
