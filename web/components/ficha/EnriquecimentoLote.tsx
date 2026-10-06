import Link from "next/link";
import { Cadeado } from "@/components/busca/PainelFiltros";
import type { Imovel, Lote } from "@/lib/consultas";
import { enriquecerLote } from "@/lib/enriquecimento";
import { area, quando, reais } from "@/lib/formato";

/** "Mais informações do leiloeiro": só para assinante. Lê a página do lote (e a do leiloeiro) na primeira visita e
 * guarda o resultado. Vem em streaming: a ficha aparece na hora e este bloco entra quando a leitura termina. */
export default async function EnriquecimentoLote({ lote, imovel }: { lote: Lote; imovel: Imovel }) {
  const e = await enriquecerLote(lote, imovel);
  if (!e) return null;
  const d = e.dados;

  const campos: [string, string][] = [];
  if (d.valor_dividas_total != null) campos.push(["Dívidas informadas (total)", reais(d.valor_dividas_total)]);
  if (d.valor_iptu_atrasado != null) campos.push(["IPTU atrasado", reais(d.valor_iptu_atrasado)]);
  if (d.valor_condominio_atrasado != null) campos.push(["Condomínio atrasado", reais(d.valor_condominio_atrasado)]);
  if (d.processo && !lote.processo) campos.push(["Processo", d.processo]);
  if (d.matricula && !imovel.matricula) campos.push(["Matrícula", d.cartorio ? `${d.matricula} · ${d.cartorio}` : d.matricula]);
  if (d.area_privativa != null && imovel.area_privativa == null) campos.push(["Área privativa", area(d.area_privativa) ?? ""]);
  if (d.area_terreno != null && imovel.area_terreno == null) campos.push(["Área do terreno", area(d.area_terreno) ?? ""]);
  if (d.comissao_leiloeiro_pct != null) campos.push(["Comissão do leiloeiro", `${d.comissao_leiloeiro_pct}%`]);
  if (d.forma_pagamento) campos.push(["Como pagar", d.forma_pagamento]);

  const temEdital = !!d.edital_url && !lote.edital_url;
  const temLeiloeiro = !!d.url_leiloeiro;
  const nada = !d.resumo && !campos.length && !d.riscos?.length && !temEdital && !temLeiloeiro;

  return (
    <section className="painel">
      <h2>Mais informações do leiloeiro</h2>
      {nada ? (
        <p className="texto muted">Lemos as páginas deste imóvel e não encontramos nada além do que já está acima.</p>
      ) : (
        <>
          {d.resumo && <p className="texto">{d.resumo}</p>}
          {campos.length > 0 && (
            <div className="dados">
              {campos.map(([nome, valor]) => (
                <div className="dado" key={nome}><span>{nome}</span><b>{valor}</b></div>
              ))}
            </div>
          )}
          {d.riscos && d.riscos.length > 0 && (
            <div>
              <b>Pontos de atenção que a página cita</b>
              <div className="chips">
                {d.riscos.map((r) => <span className="chip chip-aviso" key={r}>{r}</span>)}
              </div>
            </div>
          )}
          {(temEdital || temLeiloeiro) && (
            <div className="chips">
              {/* o endereço real só sai por /ir/, e só para assinante */}
              {temLeiloeiro && <a className="chip" href={`/ir/${lote.id}?para=leiloeiro`} target="_blank" rel="noopener">Página no site do leiloeiro ↗</a>}
              {temEdital && <a className="chip" href={`/ir/${lote.id}?para=edital`} target="_blank" rel="noopener">Edital ↗</a>}
            </div>
          )}
        </>
      )}
      <p className="muted nota">
        Lido por IA nas páginas do vendedor e do leiloeiro{e.atualizado_em ? ` em ${quando(e.atualizado_em)}` : ""}. Pode errar ou estar
        desatualizado: quem manda é o edital. Confira antes do lance.
      </p>
    </section>
  );
}

export function EnriquecimentoCarregando() {
  return (
    <section className="painel" aria-busy="true">
      <h2>Mais informações do leiloeiro</h2>
      <p className="texto muted">Lendo as páginas do vendedor e do leiloeiro. Pode levar alguns segundos na primeira vez.</p>
    </section>
  );
}

/** Quem não assina vê que existe, mas nada é lido e nada é gasto. */
export function EnriquecimentoTravado() {
  return (
    <section className="painel">
      <h2>Mais informações do leiloeiro</h2>
      <p className="texto">
        Dívidas, processo, forma de pagamento, comissão, pontos de atenção e os links do edital e da página no site do leiloeiro,
        lidos para você.
      </p>
      <div>
        <Link href="/assinar" className="link-travado"><Cadeado tamanho={12} /> Para assinantes</Link>
      </div>
    </section>
  );
}
