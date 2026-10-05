"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BotaoAlerta from "@/components/alertas/BotaoAlerta";
import { contarFiltros, ORDENS, paraUrl, type Filtros } from "@/lib/busca/filtros";
import type { ItemBusca } from "@/lib/consultas";
import { area, reais } from "@/lib/formato";
import BuscaLugar from "./BuscaLugar";
import CardImovel, { quandoLeilao, tituloCurto } from "./CardImovel";
import MapaBusca, { type Bbox, type PontoCompacto } from "./MapaBusca";
import PainelFiltros, { Cadeado, FiltrosTravados, type Opcoes } from "./PainelFiltros";

type Props = {
  assinante: boolean;
  opcoes: Opcoes | null;
  filtrosIniciais: Filtros;
  totais: { imoveis: number; fontes: number };
};

type Lista = { itens: ItemBusca[]; total: number; pagina: number; por_pagina: number };

const ROTULO_ORDEM: Record<string, string> = {
  desconto: "Maior desconto",
  preco: "Menor lance",
  leilao: "Leilão mais próximo",
  recentes: "Mais recentes",
  m2: "Menor preço por m²",
};

function semMapa(f: Filtros): Filtros {
  const { bbox: _b, pagina: _p, ...resto } = f;
  return { ...resto, pagina: 1 };
}

export default function Busca({ assinante, opcoes, filtrosIniciais, totais }: Props) {
  const [filtros, setFiltros] = useState<Filtros>(semMapa(filtrosIniciais));
  const [versaoPainel, setVersaoPainel] = useState(0);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [pagina, setPagina] = useState(1);
  const [pontos, setPontos] = useState<PontoCompacto[]>([]);
  const [lista, setLista] = useState<Lista | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [balao, setBalao] = useState<ItemBusca | null>(null);
  const [enquadrar, setEnquadrar] = useState<{ bbox: Bbox; chave: number }>();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [totalFiltrado, setTotalFiltrado] = useState<number | null>(null);
  // depois que a pessoa mexe num filtro, o mapa vai até onde estão os resultados
  const enquadrarAoFiltrar = useRef(false);

  const qsFiltros = useMemo(() => paraUrl(assinante ? filtros : { pagina: 1 }).toString(), [filtros, assinante]);
  const nFiltros = assinante ? contarFiltros(filtros) : 0;

  // URL sempre reflete os filtros (dá para salvar nos favoritos e compartilhar)
  useEffect(() => {
    const url = qsFiltros ? `/?${qsFiltros}` : "/";
    window.history.replaceState(null, "", url);
  }, [qsFiltros]);

  // pontos do mapa: mudam só com os filtros
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/pontos?${qsFiltros}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => {
          const ps: PontoCompacto[] = d.pontos ?? [];
          setPontos(ps);
          setTotalFiltrado(ps.length);
          if (enquadrarAoFiltrar.current && ps.length) {
            enquadrarAoFiltrar.current = false;
            const lats = ps.map((x) => x[1]);
            const lons = ps.map((x) => x[2]);
            setEnquadrar({ bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], chave: Date.now() });
          }
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [qsFiltros]);

  // volta para a página 1 quando mudam filtros ou a área do mapa
  useEffect(() => setPagina(1), [qsFiltros, bbox]);

  // lista: a área visível do mapa + filtros
  useEffect(() => {
    if (!bbox) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setCarregando(true);
      const p = new URLSearchParams(qsFiltros);
      p.set("bbox", bbox.join(","));
      if (pagina > 1) p.set("pagina", String(pagina));
      fetch(`/api/imoveis?${p}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: Lista) => setLista(d))
        .catch(() => {})
        .finally(() => setCarregando(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [qsFiltros, bbox, pagina]);

  // balão do imóvel clicado no mapa
  useEffect(() => {
    if (selecionado == null) return setBalao(null);
    const naLista = lista?.itens.find((i) => i.imovel_id === selecionado);
    if (naLista) return setBalao(naLista);
    const ctl = new AbortController();
    fetch(`/api/imoveis/${selecionado}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBalao)
      .catch(() => {});
    return () => ctl.abort();
  }, [selecionado, lista]);

  const mudar = useCallback((parcial: Partial<Filtros>) => {
    // ordem e raio não mudam onde estão os resultados; o resto pode mudar
    if (!("ordem" in parcial) && !("raio_km" in parcial) && !("centro" in parcial)) enquadrarAoFiltrar.current = true;
    setFiltros((f) => {
      const n = { ...f, ...parcial, pagina: 1 };
      for (const k of Object.keys(n) as (keyof Filtros)[]) if (n[k] === undefined) delete n[k];
      return n;
    });
  }, []);

  const limpar = () => {
    setFiltros({ pagina: 1 });
    setVersaoPainel((v) => v + 1);
  };

  const centroMapa: [number, number] | null = bbox ? [+((bbox[1] + bbox[3]) / 2).toFixed(5), +((bbox[0] + bbox[2]) / 2).toFixed(5)] : null;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.por_pagina)) : 1;

  const painel = assinante && opcoes ? (
    <PainelFiltros key={versaoPainel} filtros={filtros} opcoes={opcoes} centroMapa={centroMapa} mudar={mudar} limpar={limpar} total={totalFiltrado} />
  ) : (
    <FiltrosTravados />
  );

  return (
    <>
      <section className="heroi">
        <div className="heroi-texto">
          <p className="lema">Encontre. Faça a conta. Decida.</p>
          <p className="sublema">Imóveis de leilão da Caixa, outros bancos e leiloeiros oficiais, num mapa só.</p>
        </div>
        <BuscaLugar onEscolher={(b) => setEnquadrar({ bbox: b, chave: Date.now() })} />
        <p className="heroi-numeros num">
          {totais.imoveis.toLocaleString("pt-BR")} imóveis de mais de 900 fontes oficiais
        </p>
      </section>

      <div className="area-busca">
        <aside className={`coluna-filtros${gavetaAberta ? " aberta" : ""}`} aria-label="Filtros">
          <button type="button" className="fechar-gaveta" onClick={() => setGavetaAberta(false)} aria-label="Fechar filtros">
            Ver resultados
          </button>
          {painel}
        </aside>

        <div className="coluna-resultados">
          <div className="barra-resultados">
            <button type="button" className={`botao-filtros${nFiltros ? " ligado" : ""}`} onClick={() => setGavetaAberta(true)}>
              {!assinante && <Cadeado />} Filtros{nFiltros ? ` (${nFiltros})` : ""}
            </button>
            {assinante ? (
              <label className="ordem">
                <span>Ordenar por</span>
                <select value={filtros.ordem ?? "desconto"} onChange={(e) => mudar({ ordem: e.target.value })}>
                  {Object.keys(ORDENS).map((o) => <option key={o} value={o}>{ROTULO_ORDEM[o]}</option>)}
                </select>
              </label>
            ) : (
              <Link href="/assinar" className="ordem travada"><Cadeado /> Ordenar</Link>
            )}
          </div>

          <div className="moldura-mapa">
            <MapaBusca
              pontos={pontos}
              enquadrar={enquadrar}
              selecionado={selecionado}
              onMover={setBbox}
              onSelecionar={setSelecionado}
            />
            {balao && (
              <div className="balao" role="dialog" aria-label="Imóvel selecionado">
                <button type="button" className="balao-fechar" onClick={() => setSelecionado(null)} aria-label="Fechar">×</button>
                <div className="balao-foto" style={balao.foto ? { backgroundImage: `url(${balao.foto})` } : undefined} />
                <b>{tituloCurto(balao)}</b>
                <span className="muted">
                  {[balao.cidade && `${balao.cidade}/${balao.uf}`, area(balao.area), balao.comitente].filter(Boolean).join(" · ")}
                </span>
                <div className="balao-preco">
                  <span>Lance mínimo</span>
                  <b className="num">{reais(balao.lance_minimo)}</b>
                </div>
                {quandoLeilao(balao) && <span className="cartao-quando">{quandoLeilao(balao)}</span>}
                <div className="balao-acoes">
                  <Link className="botao" href={`/imovel/${balao.imovel_id}`}>Ver imóvel</Link>
                  {assinante ? (
                    <BotaoAlerta imovelId={balao.imovel_id} ativoInicial={false} textoCriar="Criar alerta" />
                  ) : (
                    <Link className="botao secundario" href="/assinar"><Cadeado /> Alerta</Link>
                  )}
                </div>
              </div>
            )}
            <div className="aviso-area num" aria-live="polite">
              {lista == null
                ? "Carregando o mapa…"
                : `${lista.total.toLocaleString("pt-BR")} imóveis nesta área${lista.total > 0 ? " · aproxime para ver cada um" : ""}`}
            </div>
          </div>

          <section className={`grade-cartoes${carregando ? " carregando" : ""}`} aria-label="Imóveis nesta área">
            {lista && lista.itens.length === 0 && (
              <div className="vazio">
                Nenhum imóvel nesta área{nFiltros ? " com esses filtros" : ""}. Afaste o mapa
                {nFiltros ? " ou tire algum filtro" : ""}.
              </div>
            )}
            {lista?.itens.map((i) => (
              <CardImovel key={i.imovel_id} i={i} ativo={i.imovel_id === selecionado} />
            ))}
          </section>

          {paginas > 1 && (
            <nav className="paginacao" aria-label="Páginas">
              <button type="button" className="botao secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </button>
              <span className="muted num">Página {pagina} de {paginas}</span>
              <button type="button" className="botao secundario" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
                Próxima
              </button>
            </nav>
          )}
        </div>
      </div>
    </>
  );
}
