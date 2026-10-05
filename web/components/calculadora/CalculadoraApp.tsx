"use client";

import { useMemo, useState } from "react";
import { calcular, custoReformaM2, type Entrada, type Grupo, type Item, type Modalidade } from "@/lib/calculadora/calcular";
import * as P from "@/lib/calculadora/parametros";
import { pesquisarValorMercado, type AmostraMercado } from "@/lib/calculadora/pesquisaMercado";
import { TIPOS } from "@/lib/formato";

export type Prefill = {
  imovelId?: number;
  titulo?: string;
  lance?: number | null;
  uf?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  tipo?: string | null;
  modalidade?: string | null;
  area?: number | null;
  avaliacao?: number | null;
  ocupado?: boolean;
  debitosComVoce?: boolean;
};

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const TIPOS_CALC = ["apartamento", "casa", "terreno", "comercial", "galpao", "rural"] as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const GRUPOS: { id: Grupo; titulo: string }[] = [
  { id: "arrematar", titulo: "Para arrematar" },
  { id: "preparar", titulo: "Para deixar pronto" },
  { id: "manter", titulo: "Até vender" },
  { id: "vender", titulo: "Na venda" },
];
const PADROES: { id: P.PadraoReforma; rotulo: string }[] = [
  { id: "nenhuma", rotulo: "Sem reforma" },
  { id: "simples", rotulo: "Baixo padrão" },
  { id: "medio", rotulo: "Médio padrão" },
  { id: "alto", rotulo: "Alto padrão" },
];

/** Campo de número que aceita vazio e vírgula. */
function Num({ rotulo, valor, set, ajuda, sufixo, passo = 1 }: {
  rotulo: string; valor: string; set: (v: string) => void; ajuda?: string; sufixo?: string; passo?: number;
}) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <div className="campo-num">
        <input inputMode="decimal" value={valor} step={passo} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ""))} />
        {sufixo && <em>{sufixo}</em>}
      </div>
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}
/** "275.000" e "275000" → 275000; "2,5" e "2.5" → 2.5 */
const n = (s: string) => {
  const t = s.trim();
  const limpo = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const v = Number(limpo);
  return Number.isFinite(v) ? v : 0;
};
const nOpc = (s: string) => (s.trim() === "" ? undefined : n(s));
const txt = (v: number | null | undefined) => (v == null || v === 0 ? "" : String(Math.round(v)));

function Selo({ item }: { item: Item }) {
  if (item.fonte.situacao !== "estimativa") return null;
  return (
    <span className="selo-estimativa" title={item.fonte.descricao}>
      estimativa
    </span>
  );
}

export default function CalculadoraApp({ prefill, pesquisaMercadoDisponivel }: { prefill: Prefill; pesquisaMercadoDisponivel: boolean }) {
  const [lance, setLance] = useState(txt(prefill.lance));
  const [uf, setUf] = useState(prefill.uf ?? "DF");
  const [cidade, setCidade] = useState(prefill.cidade ?? "");
  const [bairro, setBairro] = useState(prefill.bairro ?? "");
  const [tipo, setTipo] = useState<string>(
    (TIPOS_CALC as readonly string[]).includes(prefill.tipo ?? "") ? (prefill.tipo as string) : "apartamento",
  );
  const [modalidade, setModalidade] = useState<Modalidade>(
    (["judicial", "extrajudicial", "venda_direta", "licitacao"].includes(prefill.modalidade ?? "") ? prefill.modalidade : "extrajudicial") as Modalidade,
  );
  const [novo, setNovo] = useState(false);
  const [area, setArea] = useState(txt(prefill.area));
  const [modoMercado, setModoMercado] = useState<"m2" | "total">("m2");
  const [m2, setM2] = useState("");
  const [mercadoTotal, setMercadoTotal] = useState("");
  const [buscandoMercado, setBuscandoMercado] = useState(false);
  const [erroMercado, setErroMercado] = useState("");
  const [amostrasMercado, setAmostrasMercado] = useState<AmostraMercado[] | null>(null);
  const [observacaoMercado, setObservacaoMercado] = useState("");
  const [padrao, setPadrao] = useState<P.PadraoReforma>("simples");
  const [meses, setMeses] = useState("12");
  const [condominio, setCondominio] = useState("");
  const [iptu, setIptu] = useState("");
  const [debitos, setDebitos] = useState("");
  const [desocupacao, setDesocupacao] = useState("");
  const [outros, setOutros] = useState("");
  const [corretagem, setCorretagem] = useState(String(P.CORRETAGEM_VENDA_PCT));
  const [unico, setUnico] = useState(false);
  const [reinveste, setReinveste] = useState(false);
  const [meta, setMeta] = useState("20");
  // ajustes finos
  const [comissao, setComissao] = useState(String(P.COMISSAO_LEILOEIRO_PCT));
  const [advogado, setAdvogado] = useState(String(P.ADVOGADO_PCT));
  const [itbi, setItbi] = useState("");
  const [cartorio, setCartorio] = useState("");
  const [taxas, setTaxas] = useState(String(P.OUTRAS_TAXAS_CARTORIO));
  const [laudemio, setLaudemio] = useState("");
  const [reformaM2, setReformaM2] = useState("");

  const entrada: Entrada = {
    lance: n(lance),
    uf,
    cidade,
    modalidade,
    imovelNovo: novo,
    area: n(area),
    precoM2Regiao: modoMercado === "m2" ? n(m2) : undefined,
    valorMercado: modoMercado === "total" ? n(mercadoTotal) : undefined,
    comissaoLeiloeiroPct: n(comissao),
    advogadoPct: n(advogado),
    itbiPct: nOpc(itbi),
    cartorioManual: nOpc(cartorio),
    outrasTaxasCartorio: n(taxas),
    laudemio: n(laudemio),
    reformaPadrao: padrao,
    reformaCustoM2: nOpc(reformaM2),
    debitosAssumidos: n(debitos),
    desocupacao: n(desocupacao),
    mesesAteVender: Math.max(1, n(meses)),
    condominioMensal: n(condominio),
    iptuMensal: n(iptu),
    outrosCustos: n(outros),
    corretagemVendaPct: n(corretagem),
    isencaoUnicoImovel: unico,
    isencaoReinvestimento: reinveste,
    metaRetornoPct: meta.trim() === "" ? undefined : n(meta),
  };
  const pronto = entrada.lance > 0 && entrada.area > 0;
  const r = useMemo(() => (pronto ? calcular(entrada) : null), [JSON.stringify(entrada)]); // eslint-disable-line react-hooks/exhaustive-deps
  const semMercado = r != null && r.valorMercado <= 0;
  const mercadoCalc = modoMercado === "m2" ? n(m2) * n(area) : n(mercadoTotal);

  const podePesquisarMercado = pesquisaMercadoDisponivel && uf && cidade.trim() && n(area) > 0;
  async function pesquisarMercado() {
    if (!podePesquisarMercado || buscandoMercado) return;
    setBuscandoMercado(true);
    setErroMercado("");
    setAmostrasMercado(null);
    const r = await pesquisarValorMercado({ uf, cidade, bairro: bairro || undefined, tipo, area: n(area) });
    setBuscandoMercado(false);
    if (!r.ok) {
      setErroMercado(r.erro);
      return;
    }
    setModoMercado("m2");
    setM2(String(r.precoM2Medio));
    setAmostrasMercado(r.amostras);
    setObservacaoMercado(r.observacao ?? "");
  }

  return (
    <div className="calc-app">
      <form className="calc-entradas" onSubmit={(e) => e.preventDefault()}>
        {prefill.titulo && (
          <p className="aviso">
            Dados de <a href={`/imovel/${prefill.imovelId}`}>{prefill.titulo}</a>. Confira e complete o que falta.
          </p>
        )}

        <fieldset className="painel">
          <legend><span className="passo-n">1</span> O imóvel e o lance</legend>
          <Num rotulo="Valor do lance (arrematação)" valor={lance} set={setLance} sufixo="R$" passo={1000} />
          <div className="dupla">
            <label className="campo">
              <span>Estado</span>
              <select value={uf} onChange={(e) => setUf(e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
            </label>
            <label className="campo">
              <span>Cidade</span>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Goiânia" />
            </label>
          </div>
          <div className="dupla">
            <label className="campo">
              <span>Bairro <small>(opcional, ajuda a pesquisa de valor de mercado)</small></span>
              <input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Setor Bueno" />
            </label>
            <label className="campo">
              <span>Tipo de imóvel</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CALC.map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
              </select>
            </label>
          </div>
          <div className="dupla">
            <label className="campo">
              <span>Tipo de venda</span>
              <select value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade)}>
                <option value="extrajudicial">Leilão extrajudicial (banco)</option>
                <option value="judicial">Leilão judicial</option>
                <option value="venda_direta">Venda direta</option>
                <option value="licitacao">Licitação</option>
              </select>
            </label>
            <Num rotulo="Área do imóvel" valor={area} set={setArea} sufixo="m²" />
          </div>
          {uf === "DF" && (
            <label className="marcar">
              <input type="checkbox" checked={novo} onChange={(e) => setNovo(e.target.checked)} />
              <span>Imóvel novo, primeira venda<small>No DF, o ITBI cai de 2% para 1%.</small></span>
            </label>
          )}
        </fieldset>

        <fieldset className="painel">
          <legend><span className="passo-n">2</span> Quanto ele vale</legend>
          <p className="muted nota">
            Procure anúncios parecidos no mesmo bairro (portais de imóveis) e tire a média do preço por m². A avaliação
            do edital nem sempre é o preço de mercado.
          </p>
          <div className="pilulas" role="group" aria-label="Como informar o valor">
            <button type="button" className={`pilula${modoMercado === "m2" ? " ligada" : ""}`} onClick={() => setModoMercado("m2")}>Pelo m² da região</button>
            <button type="button" className={`pilula${modoMercado === "total" ? " ligada" : ""}`} onClick={() => setModoMercado("total")}>Valor total</button>
          </div>
          <div className="linha-m2-busca">
            {modoMercado === "m2" ? (
              <Num rotulo="Preço médio do m² na região" valor={m2} set={setM2} sufixo="R$/m²" passo={100} />
            ) : (
              <Num rotulo="Valor de venda esperado" valor={mercadoTotal} set={setMercadoTotal} sufixo="R$" passo={1000} />
            )}
            {pesquisaMercadoDisponivel && (
              <button
                type="button"
                className="botao secundario botao-pesquisar-mercado"
                disabled={!podePesquisarMercado || buscandoMercado}
                onClick={pesquisarMercado}
                title={podePesquisarMercado ? "Busca anúncios parecidos e calcula a média do m²" : "Informe estado, cidade e área para pesquisar"}
              >
                {buscandoMercado ? "Pesquisando…" : "Pesquisar valor de mercado"}
              </button>
            )}
          </div>
          {erroMercado && <p className="nota ruim">{erroMercado}</p>}
          {mercadoCalc > 0 && (
            <p className="destaque-num">Valor de mercado estimado: <b>{brl.format(mercadoCalc)}</b></p>
          )}
          {prefill.avaliacao ? (
            <p className="muted nota">Avaliação do edital: {brl.format(prefill.avaliacao)}.</p>
          ) : null}
          {amostrasMercado && amostrasMercado.length > 0 && (
            <details className="anuncios-mercado" open>
              <summary>{amostrasMercado.length} anúncios usados na pesquisa</summary>
              {observacaoMercado && <p className="muted nota">{observacaoMercado}</p>}
              <ul>
                {amostrasMercado.map((a, i) => (
                  <li key={i}>
                    {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.titulo}</a> : <span>{a.titulo}</span>}
                    <span className="muted num"> — {brl.format(a.preco)}, {a.area.toLocaleString("pt-BR")} m² (R$ {a.precoM2.toLocaleString("pt-BR")}/m²)</span>
                  </li>
                ))}
              </ul>
              <p className="muted nota">Anúncios encontrados numa busca automática. Confira antes de decidir: preço pedido não é preço vendido.</p>
            </details>
          )}
        </fieldset>

        <fieldset className="painel">
          <legend><span className="passo-n">3</span> Reforma</legend>
          <div className="opcoes-reforma" role="radiogroup" aria-label="Padrão da reforma">
            {PADROES.map((p) => {
              const custo = custoReformaM2(p.id, uf);
              const faixa = p.id === "nenhuma" ? null : P.REFORMA_M2[p.id];
              return (
                <label key={p.id} className={`opcao-reforma${padrao === p.id ? " ligada" : ""}`}>
                  <input type="radio" name="padrao" checked={padrao === p.id} onChange={() => setPadrao(p.id)} />
                  <b>{p.rotulo}</b>
                  <span className="num">{faixa ? `~${brl.format(custo)}/m²` : "R$ 0"}</span>
                  {faixa && n(area) > 0 && <small className="num">{brl.format(custo * n(area))} no total</small>}
                </label>
              );
            })}
          </div>
          <p className="muted nota">
            Baixo: pintura, piso e reparos. Médio: troca de acabamentos, cozinha e banheiros. Alto: reforma completa com
            materiais de primeira. {["SP", "RJ", "MG", "ES", "PR", "SC", "RS"].includes(uf) ? `Valores com o ajuste de ${uf} (+${Math.round(((P.FATOR_REGIONAL[uf] ?? 1) - 1) * 100)}%).` : ""}
          </p>
        </fieldset>

        <fieldset className="painel">
          <legend><span className="passo-n">4</span> Até vender</legend>
          <p className="muted nota">
            Enquanto você não vende, condomínio, IPTU e outros custos continuam saindo do seu bolso todo mês — por
            isso entram na conta. Em "meses até vender", conte da data do arremate até a venda: inclua o tempo de
            registro, o tempo de reforma (se houver) e quanto tempo acha que vai levar para achar comprador.
          </p>
          <div className="dupla">
            <Num rotulo="Meses até vender" valor={meses} set={setMeses} sufixo="meses" ajuda="Inclua o tempo de registro e reforma." />
            <Num rotulo="Condomínio por mês" valor={condominio} set={setCondominio} sufixo="R$" />
          </div>
          <div className="dupla">
            <Num rotulo="IPTU por mês" valor={iptu} set={setIptu} sufixo="R$" />
            <Num rotulo="Outros custos" valor={outros} set={setOutros} sufixo="R$" ajuda="Luz, água, seguro…" />
          </div>
          <div className="dupla">
            <Num rotulo="Dívidas que ficam com você" valor={debitos} set={setDebitos} sufixo="R$"
              ajuda={prefill.debitosComVoce ? "A fonte diz que as dívidas passam para você: peça os valores." : "Só se o edital disser que ficam com o arrematante."} />
            <Num rotulo="Desocupação" valor={desocupacao} set={setDesocupacao} sufixo="R$"
              ajuda={prefill.ocupado ? "A fonte diz que está ocupado: conte acordo ou advogado." : "Se estiver ocupado: acordo ou ação na justiça."} />
          </div>
        </fieldset>

        <fieldset className="painel">
          <legend><span className="passo-n">5</span> Na venda</legend>
          <p className="muted nota">
            Imposto de renda sobre o lucro da venda: 15% a 22,5%, por faixa de ganho. Duas situações isentam: vender
            o seu único imóvel por até R$ 440 mil (sem ter vendido outro nos últimos 5 anos), ou reinvestir o
            dinheiro recebido em outro imóvel residencial em até 180 dias (isenta só a parte reinvestida).
          </p>
          <Num rotulo="Corretagem" valor={corretagem} set={setCorretagem} sufixo="%" />
          <label className="marcar">
            <input type="checkbox" checked={unico} onChange={(e) => setUnico(e.target.checked)} />
            <span>Vou vender meu único imóvel, por até R$ 440 mil<small>Isento de imposto de renda sobre o lucro, se não vendeu outro nos últimos 5 anos.</small></span>
          </label>
          <label className="marcar">
            <input type="checkbox" checked={reinveste} onChange={(e) => setReinveste(e.target.checked)} />
            <span>Vou usar o dinheiro para comprar outro imóvel residencial em até 180 dias<small>Também isenta o imposto, na parte reinvestida.</small></span>
          </label>
        </fieldset>

        <details className="painel ajustes">
          <summary>Ajustes finos (se você já tem orçamentos)</summary>
          <div className="dupla">
            <Num rotulo="Comissão do leiloeiro" valor={comissao} set={setComissao} sufixo="%" />
            <Num rotulo="Advogado" valor={advogado} set={setAdvogado} sufixo="% do lance" />
          </div>
          <div className="dupla">
            <Num rotulo="ITBI (vazio = tabela da cidade)" valor={itbi} set={setItbi} sufixo="%" />
            <Num rotulo="Escritura + registro (orçamento)" valor={cartorio} set={setCartorio} sufixo="R$" />
          </div>
          <div className="dupla">
            <Num rotulo="Certidões e taxas" valor={taxas} set={setTaxas} sufixo="R$" />
            <Num rotulo="Laudêmio" valor={laudemio} set={setLaudemio} sufixo="R$" ajuda="Só terreno de marinha." />
          </div>
          <Num rotulo="Custo da reforma por m² (orçamento)" valor={reformaM2} set={setReformaM2} sufixo="R$/m²" />
        </details>
      </form>

      {r && (
        <a className="barra-resultado-cel" href="#resultado">
          <span>{semMercado ? "Custo total" : r.lucro >= 0 ? "Lucro" : "Prejuízo"}</span>
          <b className="num">{brl.format(semMercado ? r.investimentoTotal : r.lucro)}</b>
          {!semMercado && <span className="num">{pct(r.retornoPct)}</span>}
          <span className="ver">Ver conta ↓</span>
        </a>
      )}
      <aside className="calc-resultado" id="resultado" aria-live="polite">
        {!r ? (
          <section className="painel vazio-calc">
            <h2>A conta aparece aqui</h2>
            <p>Preencha o valor do lance e a área do imóvel.</p>
          </section>
        ) : (
          <>
            <section className={`painel placar ${semMercado ? "" : r.lucro >= 0 ? "positivo" : "negativo"}`}>
              {semMercado ? (
                <>
                  <span className="rotulo">Custo total até vender</span>
                  <b className="placar-valor num">{brl.format(r.investimentoTotal)}</b>
                  <p className="nota">Informe quanto o imóvel vale (passo 2) para ver o lucro e o lance máximo.</p>
                </>
              ) : (
                <>
                  <span className="rotulo">{r.lucro >= 0 ? "Lucro estimado" : "Prejuízo estimado"}</span>
                  <b className="placar-valor num">{brl.format(r.lucro)}</b>
                  <span className="num">
                    {pct(r.retornoPct)} sobre o que você investe, em {entrada.mesesAteVender} meses ({pct(r.retornoMensalPct)} ao mês)
                  </span>
                </>
              )}
              <div className="kpis">
                <div className="kpi"><span>Você investe</span><b className="num">{brl.format(r.investimentoTotal)}</b></div>
                <div className="kpi"><span>Vende por</span><b className="num">{semMercado ? "—" : brl.format(r.valorMercado)}</b></div>
                <div className="kpi"><span>Abaixo do mercado</span><b className="num">{semMercado ? "—" : pct(r.descontoRealPct)}</b></div>
              </div>
            </section>

            <section className="painel meta">
              <label className="meta-linha">
                <span>Quero ganhar pelo menos</span>
                <div className="campo-num curto">
                  <input inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value.replace(/[^\d.,-]/g, ""))} aria-label="Meta de retorno" />
                  <em>%</em>
                </div>
              </label>
              {semMercado ? (
                <p className="nota muted">O lance máximo precisa do valor de mercado.</p>
              ) : r.lanceMaximo === 0 ? (
                <p className="nota ruim">Com esses custos, nem um lance perto de zero chega a essa meta.</p>
              ) : r.lanceMaximo != null ? (
                <>
                  <span className="rotulo">Lance máximo para essa meta</span>
                  <b className="lance-maximo num">{brl.format(r.lanceMaximo)}</b>
                  <p className="nota">
                    {r.lanceMaximo >= entrada.lance
                      ? <>Seu lance está <b className="bom">{brl.format(r.lanceMaximo - entrada.lance)} abaixo</b> do limite.</>
                      : <>Seu lance passa <b className="ruim">{brl.format(entrada.lance - r.lanceMaximo)}</b> do limite. Na disputa, não vá além do máximo.</>}
                  </p>
                </>
              ) : null}
            </section>

            <section className="painel detalhamento">
              <h2>Para onde vai o dinheiro</h2>
              <table>
                <tbody>
                  <tr className="linha-lance-calc"><th scope="row">Lance</th><td className="num">{brl.format(entrada.lance)}</td></tr>
                  {GRUPOS.map((g) => {
                    const itens = r.itens.filter((i) => i.grupo === g.id && (i.valor > 0 || i.id === "ir"));
                    if (!itens.length) return null;
                    return [
                      <tr key={g.id} className="grupo"><th colSpan={2}>{g.titulo}</th></tr>,
                      ...itens.map((i) => (
                        <tr key={i.id}>
                          <th scope="row">{i.rotulo} <Selo item={i} /><small>{i.detalhe}</small></th>
                          <td className="num">{brl.format(i.valor)}</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
              <p className="muted nota">
                Itens marcados como estimativa usam valores médios; troque pelos seus orçamentos em Ajustes finos. Esta conta
                não é recomendação de compra.
              </p>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
