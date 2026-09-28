import { diaMes, reais } from "@/lib/formato";

type Ponto = { quando: string; valor: number };

// Linha em degraus do lance mínimo ao longo do tempo. Desenhada no servidor, sem biblioteca.
export default function GraficoPreco({ pontos, avaliacao }: { pontos: Ponto[]; avaliacao: number | null }) {
  const ps = pontos.filter((p) => p.valor > 0).sort((a, b) => +new Date(a.quando) - +new Date(b.quando));
  if (ps.length < 2 || new Set(ps.map((p) => p.valor)).size < 2) return null;
  const L = 640, A = 200, m = { e: 8, d: 8, t: 16, b: 26 };
  const t0 = +new Date(ps[0].quando), t1 = Math.max(+new Date(ps[ps.length - 1].quando), t0 + 1);
  const valores = [...ps.map((p) => p.valor), ...(avaliacao ? [avaliacao] : [])];
  const vmin = Math.min(...valores) * 0.9, vmax = Math.max(...valores) * 1.04;
  const x = (t: number) => m.e + ((t - t0) / (t1 - t0)) * (L - m.e - m.d);
  const y = (v: number) => m.t + (1 - (v - vmin) / (vmax - vmin)) * (A - m.t - m.b);
  let d = `M${x(t0)},${y(ps[0].valor)}`;
  for (let i = 1; i < ps.length; i++) {
    const t = +new Date(ps[i].quando);
    d += ` H${x(t)} V${y(ps[i].valor)}`;
  }
  const ultimo = ps[ps.length - 1];
  const queda = 1 - ultimo.valor / ps[0].valor;
  return (
    <figure className="grafico-preco">
      <figcaption>
        Lance mínimo foi de <b className="num">{reais(ps[0].valor)}</b> para <b className="num">{reais(ultimo.valor)}</b>
        {queda > 0 ? ` (−${Math.round(queda * 100)}%)` : ""} desde {diaMes(ps[0].quando)}.
      </figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Evolução do lance mínimo">
        {avaliacao && (
          <>
            <line x1={m.e} x2={L - m.d} y1={y(avaliacao)} y2={y(avaliacao)} className="linha-avaliacao" />
            <text x={L - m.d} y={y(avaliacao) - 5} textAnchor="end" className="rotulo-grafico">
              avaliação {reais(avaliacao)}
            </text>
          </>
        )}
        <path d={d} className="linha-lance" />
        {ps.map((p, i) => (
          <circle key={i} cx={x(+new Date(p.quando))} cy={y(p.valor)} r={4} className="ponto-lance">
            <title>{`${diaMes(p.quando)}: ${reais(p.valor)}`}</title>
          </circle>
        ))}
        <text x={m.e} y={A - 6} className="rotulo-grafico">{diaMes(ps[0].quando)}</text>
        <text x={L - m.d} y={A - 6} textAnchor="end" className="rotulo-grafico">{diaMes(ultimo.quando)}</text>
      </svg>
    </figure>
  );
}
