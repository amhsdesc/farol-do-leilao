"use client";

import { useMemo, useState } from "react";

// Alíquotas de ITBI de referência — CONFIRMAR com a prefeitura/Receita local antes de usar para decidir.
// (O DF reduziu alíquotas em 2025; a tabela vigente ainda precisa ser verificada.)
const ITBI_PADRAO: Record<string, number> = { DF: 3, GO: 2, SP: 3, MG: 3, RJ: 3 };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Campo({ id, rotulo, valor, mudar, passo = 1000 }: { id: string; rotulo: string; valor: number; mudar: (v: number) => void; passo?: number }) {
  return (
    <label htmlFor={id}>
      {rotulo}
      <input id={id} type="number" min={0} step={passo} value={Number.isFinite(valor) ? valor : 0} onChange={(e) => mudar(Number(e.target.value))} />
    </label>
  );
}

export default function Calculadora({ lance, avaliacao, uf }: { lance: number | null; avaliacao: number | null; uf: string | null }) {
  const [valorLance, setLance] = useState(lance ?? 0);
  const [venda, setVenda] = useState(avaliacao ?? lance ?? 0);
  const [comissao, setComissao] = useState(5);
  const [itbi, setItbi] = useState(ITBI_PADRAO[uf ?? ""] ?? 3);
  const [registro, setRegistro] = useState(1.5);
  const [debitos, setDebitos] = useState(0);
  const [desocupacao, setDesocupacao] = useState(0);
  const [reforma, setReforma] = useState(0);
  const [corretagem, setCorretagem] = useState(6);
  const [meta, setMeta] = useState(25);

  const r = useMemo(() => {
    const variaveis = (comissao + itbi + registro) / 100;
    const fixos = debitos + desocupacao + reforma;
    const custo = valorLance * (1 + variaveis) + fixos;
    const liquido = venda * (1 - corretagem / 100);
    const lucro = liquido - custo;
    const roi = custo > 0 ? lucro / custo : 0;
    const lanceMax = Math.max(0, (liquido / (1 + meta / 100) - fixos) / (1 + variaveis));
    return { custo, liquido, lucro, roi, lanceMax, variaveis: valorLance * variaveis };
  }, [valorLance, venda, comissao, itbi, registro, debitos, desocupacao, reforma, corretagem, meta]);

  return (
    <div className="calc">
      <Campo id="c-lance" rotulo="Seu lance (R$)" valor={valorLance} mudar={setLance} />
      <Campo id="c-venda" rotulo="Valor de venda esperado (R$)" valor={venda} mudar={setVenda} />
      <Campo id="c-comissao" rotulo="Comissão do leiloeiro (%)" valor={comissao} mudar={setComissao} passo={0.5} />
      <Campo id="c-itbi" rotulo={`ITBI ${uf ?? ""} (%)`} valor={itbi} mudar={setItbi} passo={0.5} />
      <Campo id="c-registro" rotulo="Escritura e registro (%)" valor={registro} mudar={setRegistro} passo={0.5} />
      <Campo id="c-debitos" rotulo="Débitos assumidos (R$)" valor={debitos} mudar={setDebitos} />
      <Campo id="c-desocupacao" rotulo="Desocupação (R$)" valor={desocupacao} mudar={setDesocupacao} />
      <Campo id="c-reforma" rotulo="Reforma (R$)" valor={reforma} mudar={setReforma} />
      <Campo id="c-corretagem" rotulo="Corretagem na revenda (%)" valor={corretagem} mudar={setCorretagem} passo={0.5} />
      <Campo id="c-meta" rotulo="Meta de lucro sobre o custo (%)" valor={meta} mudar={setMeta} passo={5} />
      <div className="linha total">
        <span>Custo total</span>
        <span className="num">{brl.format(r.custo)}</span>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Lucro bruto</span>
          <b className={r.lucro >= 0 ? "bom" : "ruim"}>{brl.format(r.lucro)}</b>
        </div>
        <div className="kpi">
          <span>Retorno sobre o custo</span>
          <b className={r.roi >= 0 ? "bom" : "ruim"}>{pct(r.roi)}</b>
        </div>
        <div className="kpi">
          <span>Lance máximo p/ {meta}%</span>
          <b>{brl.format(r.lanceMax)}</b>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Antes do imposto sobre ganho de capital. O valor de venda parte da avaliação do edital até a avaliação por
        comparáveis entrar no ar. Confira a alíquota de ITBI do município.
      </p>
    </div>
  );
}
