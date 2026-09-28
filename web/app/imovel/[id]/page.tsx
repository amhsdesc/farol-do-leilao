import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardImovel, { tituloCurto } from "@/components/busca/CardImovel";
import { Cadeado } from "@/components/busca/PainelFiltros";
import Compartilhar from "@/components/ficha/Compartilhar";
import GraficoPreco from "@/components/ficha/GraficoPreco";
import Mapa from "@/components/Mapa";
import { acesso } from "@/lib/acesso";
import { imovel, parecidos, type Lote } from "@/lib/consultas";
import { area, MODALIDADES, porcento, quando, reais, TIPOS } from "@/lib/formato";

export const dynamic = "force-dynamic";

const EVENTOS: Record<string, string> = {
  novo: "Entrou na base",
  alterado: "Mudou",
  removido: "Saiu da fonte",
  reaparecido: "Voltou à fonte",
};

// Explicação curta de cada modalidade, na voz da marca (docs/marca.md).
const COMO_FUNCIONA: Record<string, { titulo: string; texto: string }> = {
  judicial: {
    titulo: "Leilão judicial",
    texto:
      "Um juiz mandou vender o imóvel para pagar uma dívida do dono. Na 1ª praça o lance mínimo costuma ser o valor da avaliação; na 2ª ele cai, em geral para não menos de 50% da avaliação. O antigo dono ainda pode recorrer, então leia o processo.",
  },
  extrajudicial: {
    titulo: "Leilão extrajudicial",
    texto:
      "O dono deixou de pagar o financiamento e o banco retomou o imóvel, sem passar por um juiz (Lei 9.514/97). No 1º leilão o mínimo é o valor do imóvel; no 2º, costuma cair para perto do valor da dívida.",
  },
  venda_direta: {
    titulo: "Venda direta",
    texto:
      "O imóvel já passou por leilão e ninguém comprou. Agora o vendedor aceita propostas a qualquer momento, sem disputa ao vivo: em geral leva quem primeiro fizer uma proposta válida.",
  },
  licitacao: {
    titulo: "Licitação",
    texto: "Disputa em data marcada, pela internet, entre quem se cadastrou. Ganha o maior lance acima do mínimo.",
  },
};

const ANTES_DO_LANCE = [
  { t: "Leia o edital inteiro", d: "É a regra do jogo: prazos, forma de pagamento, quem paga cada dívida." },
  { t: "Tire a matrícula atualizada", d: "No cartório de registro de imóveis. Mostra o dono, penhoras e outros problemas." },
  { t: "Veja se está ocupado", d: "Se estiver, conte o tempo e o custo para desocupar." },
  { t: "Pergunte das dívidas", d: "Condomínio na administradora; IPTU na prefeitura." },
  { t: "Cadastre-se no leiloeiro com antecedência", d: "A aprovação do cadastro pode levar alguns dias." },
  { t: "Faça a conta e decida seu lance máximo", d: "E não passe dele na hora da disputa." },
];

async function carregar(params: Promise<{ id: string }>) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return imovel(n);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await carregar(params);
  if (!d) return {};
  const im = d.imovel;
  return { title: `${TIPOS[im.tipo] ?? "Imóvel"} em leilão · ${im.bairro ?? ""} ${im.cidade ?? ""}/${im.uf ?? ""}` };
}

/** true se alguma fonte diz sim, false se alguma diz não (e nenhuma sim), null se nenhuma diz. */
function consolidar(lotes: Lote[], campo: "aceita_fgts" | "aceita_financiamento" | "aceita_parcelamento") {
  if (lotes.some((l) => l[campo] === true)) return true;
  if (lotes.some((l) => l[campo] === false)) return false;
  return null;
}

function dataProxima(l: Lote | undefined) {
  if (!l || l.modalidade === "venda_direta") return null;
  return l.praca_atual === 2 ? l.data_praca2 : (l.data_praca1 ?? l.data_praca2);
}

function contagem(data: string | null) {
  if (!data) return null;
  const dias = Math.ceil((+new Date(data) - Date.now()) / 86_400_000);
  if (dias < 0) return { texto: "Já aconteceu", classe: "passado" };
  if (dias === 0) return { texto: "É hoje", classe: "urgente" };
  if (dias === 1) return { texto: "É amanhã", classe: "urgente" };
  return { texto: `Faltam ${dias} dias`, classe: dias <= 7 ? "urgente" : "" };
}

type Estado = { rotulo: string; classe: "bom" | "aviso" | "ruim" | "neutro"; ajuda: string };

function condicoes(ocupacao: string, debitos: string, fgts: boolean | null, fin: boolean | null, parc: boolean | null) {
  const simNao = (v: boolean | null, sim: string, nao: string, nada: string): Estado =>
    v === true
      ? { rotulo: "Sim", classe: "bom", ajuda: sim }
      : v === false
        ? { rotulo: "Não", classe: "neutro", ajuda: nao }
        : { rotulo: "Não informado", classe: "aviso", ajuda: nada };
  return [
    {
      nome: "Ocupação",
      ...(ocupacao === "desocupado"
        ? { rotulo: "Desocupado", classe: "bom", ajuda: "A fonte diz que não mora ninguém. Mesmo assim, confira na visita." }
        : ocupacao === "ocupado"
          ? { rotulo: "Ocupado", classe: "ruim", ajuda: "Alguém mora lá. Desocupar pode levar meses e custar advogado e mudança." }
          : { rotulo: "Não informado", classe: "aviso", ajuda: "A fonte não diz. Não conte com o imóvel livre: confirme no edital e na visita." }),
    },
    {
      nome: "Dívidas (IPTU, condomínio)",
      ...(debitos === "vendedor"
        ? { rotulo: "Ficam com o vendedor", classe: "bom", ajuda: "Segundo a fonte, dívidas antigas não passam para você. Confira no edital." }
        : debitos === "arrematante"
          ? { rotulo: "Ficam com você", classe: "ruim", ajuda: "Você paga as dívidas atrasadas além do lance. Peça os valores antes." }
          : { rotulo: "Não informado", classe: "aviso", ajuda: "A fonte não diz quem paga. Leia o edital e pergunte ao condomínio e à prefeitura." }),
    },
    { nome: "Aceita FGTS", ...simNao(fgts, "Dá para usar o FGTS, dentro das regras do fundo.", "O pagamento não pode usar FGTS.", "Confira no edital.") },
    { nome: "Aceita financiamento", ...simNao(fin, "Dá para financiar parte do valor, se o banco aprovar seu crédito.", "Precisa pagar com recursos próprios.", "Confira no edital.") },
    { nome: "Aceita parcelamento", ...simNao(parc, "Dá para pagar o lance em parcelas, conforme o edital.", "Pagamento à vista.", "Confira no edital.") },
  ] as ({ nome: string } & Estado)[];
}

export default async function PaginaImovel({ params }: { params: Promise<{ id: string }> }) {
  const [d, { assinante }] = await Promise.all([carregar(params), acesso()]);
  if (!d) notFound();
  const { imovel: im, lotes, historico } = d;
  const vizinhos = await parecidos(im.id);

  const ativos = lotes.filter((l) => l.status === "ativo" || l.status === "suspenso");
  const base = ativos.length ? ativos : lotes;
  const melhor = base[0];
  const fotos = [...new Set(lotes.flatMap((l) => l.fotos ?? []))].slice(0, 12);
  const ocupacao = base.some((l) => l.ocupacao === "ocupado")
    ? "ocupado"
    : base.some((l) => l.ocupacao === "desocupado")
      ? "desocupado"
      : "nao_informado";
  const debitos = base.some((l) => l.debitos_por_conta === "arrematante")
    ? "arrematante"
    : base.some((l) => l.debitos_por_conta === "vendedor")
      ? "vendedor"
      : "nao_informado";
  const lista = condicoes(ocupacao, debitos, consolidar(base, "aceita_fgts"), consolidar(base, "aceita_financiamento"), consolidar(base, "aceita_parcelamento"));
  const descricao = base.map((l) => l.descricao).filter(Boolean).sort((a, b) => b!.length - a!.length)[0];
  const desconto = melhor?.valor_avaliacao && melhor?.lance_minimo ? 1 - melhor.lance_minimo / melhor.valor_avaliacao : null;
  const data = dataProxima(melhor);
  const falta = contagem(data);
  const modalidade = COMO_FUNCIONA[melhor?.modalidade ?? ""];
  const encerrado = !ativos.length;
  const textoAlerta = melhor?.modalidade === "venda_direta" ? "Me avise se o preço mudar" : "Me avise antes do leilão";
  const titulo = tituloCurto({ tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, quartos: im.quartos });

  // pontos do gráfico: cada leitura do lote principal
  const pontosPreco = historico
    .filter((h) => h.lance_minimo != null && h.fonte_nome === melhor?.fonte_nome)
    .map((h) => ({ quando: h.lida_em, valor: h.lance_minimo! }));

  const pracas =
    melhor && melhor.modalidade !== "venda_direta"
      ? [
          // sem valor da praça na fonte, a praça vigente usa o lance mínimo atual
          { n: 1, data: melhor.data_praca1, valor: melhor.valor_praca1 ?? ((melhor.praca_atual ?? 1) === 1 ? melhor.lance_minimo : null) },
          { n: 2, data: melhor.data_praca2, valor: melhor.valor_praca2 ?? (melhor.praca_atual === 2 ? melhor.lance_minimo : null) },
        ].filter((p) => p.data || p.valor)
      : [];

  return (
    <main className="pagina ficha-pagina">
      <Link href="/" className="voltar">← Voltar à busca</Link>

      <header className="ficha-cabecalho">
        <div>
          <span className="rotulo">
            {[TIPOS[im.tipo] ?? "Imóvel", MODALIDADES[melhor?.modalidade ?? ""], im.cidade && `${im.cidade}/${im.uf}`].filter(Boolean).join(" · ")}
          </span>
          <h1>{titulo}</h1>
          <p className="muted">{[im.endereco, im.bairro, im.cidade && `${im.cidade}/${im.uf}`].filter(Boolean).join(" · ")}</p>
          <div className="chips">
            {encerrado && <span className="chip chip-ruim">Não está mais à venda nas fontes</span>}
            {melhor?.status === "suspenso" && <span className="chip chip-ruim">Suspenso</span>}
            {ativos.length > 1 && <span className="chip chip-fontes">Anunciado em {ativos.length} sites</span>}
          </div>
        </div>
        <Compartilhar titulo={`${titulo} em leilão`} />
      </header>

      <div className="ficha">
        <div className="ficha-principal">
          {fotos.length > 0 ? (
            <div className="galeria">
              {fotos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={f} alt="" loading="lazy" />
              ))}
            </div>
          ) : (
            <div className="sem-foto">A fonte não publicou fotos deste imóvel.</div>
          )}

          <section className="painel">
            <h2>O imóvel</h2>
            <div className="dados">
              <div className="dado"><span>Lance mínimo agora</span><b>{reais(melhor?.lance_minimo)}</b></div>
              <div className="dado"><span>Avaliação do edital</span><b>{reais(melhor?.valor_avaliacao)}</b></div>
              <div className="dado"><span>Desconto sobre a avaliação</span><b className="bom">{porcento(desconto)}</b></div>
              <div className="dado"><span>Valor de mercado</span><b className="muted">em breve</b></div>
              {area(im.area_privativa) && <div className="dado"><span>Área privativa</span><b>{area(im.area_privativa)}</b></div>}
              {area(im.area_terreno) && <div className="dado"><span>Área do terreno</span><b>{area(im.area_terreno)}</b></div>}
              {im.quartos != null && <div className="dado"><span>Quartos / vagas</span><b>{im.quartos} / {im.vagas ?? "—"}</b></div>}
              {im.matricula && (
                <div className="dado">
                  <span>Matrícula</span>
                  <b>{im.matricula}{im.cartorio ? <small className="muted"> · {im.cartorio}</small> : null}</b>
                </div>
              )}
            </div>
            <p className="muted nota">
              Avaliação é o valor que o vendedor ou o juiz deu ao imóvel. Não é o preço de mercado: pode estar acima ou abaixo.
            </p>
          </section>

          {modalidade && (
            <section className="painel">
              <h2>Como funciona: {modalidade.titulo.toLowerCase()}</h2>
              <p className="texto">{modalidade.texto}</p>
              {pracas.length > 0 && (
                <ol className="linha-pracas">
                  {pracas.map((p) => {
                    const atual = (melhor?.praca_atual ?? 1) === p.n;
                    const passou = p.data ? +new Date(p.data) < Date.now() : false;
                    return (
                      <li key={p.n} className={`${atual ? "atual" : ""} ${passou ? "passou" : ""}`}>
                        <b>{p.n}ª praça {atual && !encerrado && <span className="chip chip-luz">agora</span>}</b>
                        <span className="num">{p.data ? quando(p.data) : "data a confirmar"}</span>
                        {p.valor != null && <span className="num">mínimo {reais(p.valor)}</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          <section className="painel">
            <h2>Condições e riscos</h2>
            <ul className="condicoes">
              {lista.map((c) => (
                <li key={c.nome}>
                  <span className="cond-nome">{c.nome}</span>
                  <span className={`cond-estado ${c.classe}`}>{c.rotulo}</span>
                  <span className="cond-ajuda">{c.ajuda}</span>
                </li>
              ))}
            </ul>
            <p className="muted nota">Copiamos o que as fontes dizem. Quem manda é o edital: confira antes do lance.</p>
          </section>

          {descricao && (
            <section className="painel">
              <h2>O que a fonte diz</h2>
              <p className="texto">{descricao}</p>
            </section>
          )}

          <section className="painel">
            <h2>Onde está anunciado ({lotes.length})</h2>
            {lotes.map((l, i) => (
              <div key={l.id} className={`fonte-lote ${i === 0 && ativos.length ? "melhor" : ""}`}>
                <div className="linha">
                  <strong>{l.fonte_nome}</strong>
                  <span className="num">{reais(l.lance_minimo)}</span>
                </div>
                <div className="chips" style={{ marginTop: 0 }}>
                  {l.comitente && <span className="chip">Vendedor: {l.comitente}</span>}
                  {l.leiloeiro && <span className="chip">Leiloeiro: {l.leiloeiro}</span>}
                  <span className="chip">{MODALIDADES[l.modalidade] ?? l.modalidade}</span>
                  <span className={`chip ${l.status === "ativo" ? "chip-bom" : "chip-aviso"}`}>{l.status}</span>
                </div>
                <div className="linha muted" style={{ fontSize: 12 }}>
                  <span>
                    {l.processo ? `Processo ${l.processo} · ` : ""}visto de {quando(l.primeiro_visto_em)} a {quando(l.ultimo_visto_em)}
                  </span>
                  <span style={{ display: "flex", gap: 10 }}>
                    {/* endereço real só no redirecionamento /ir/, e só para assinante */}
                    {assinante ? (
                      <>
                        {l.edital_url && <a href={`/ir/${l.id}?para=edital`} target="_blank" rel="noopener">Edital</a>}
                        {l.url && <a href={`/ir/${l.id}`} target="_blank" rel="noopener">Ver no site do leiloeiro ↗</a>}
                      </>
                    ) : (
                      (l.url || l.edital_url) && (
                        <Link href="/assinar" className="link-travado">
                          <Cadeado tamanho={12} /> Site do leiloeiro e edital: para assinantes
                        </Link>
                      )
                    )}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="painel">
            <h2>Histórico de preço</h2>
            <GraficoPreco pontos={pontosPreco} avaliacao={melhor?.valor_avaliacao ?? null} />
            <details className="historico">
              <summary>Ver todas as mudanças ({historico.length})</summary>
              <div className="tabela">
                <table>
                  <thead>
                    <tr><th>Quando</th><th>Fonte</th><th>O que houve</th><th>Praça</th><th>Lance mínimo</th></tr>
                  </thead>
                  <tbody>
                    {historico.map((h, i) => (
                      <tr key={i}>
                        <td className="num">{quando(h.lida_em)}</td>
                        <td>{h.fonte_nome}</td>
                        <td>{EVENTOS[h.evento] ?? h.evento}</td>
                        <td>{h.praca_atual ? `${h.praca_atual}ª` : "—"}</td>
                        <td className="num">{reais(h.lance_minimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </div>

        <aside className="ficha-lateral">
          <section className="painel cartao-lance">
            <span className="rotulo">{melhor?.modalidade === "venda_direta" ? "Venda direta" : "Próximo leilão"}</span>
            {melhor?.modalidade === "venda_direta" ? (
              <b className="lance-data">Propostas a qualquer momento</b>
            ) : (
              <>
                <b className="lance-data num">{data ? quando(data) : "Data a confirmar"}</b>
                {falta && !encerrado && <span className={`contagem ${falta.classe}`}>{falta.texto}</span>}
              </>
            )}
            <div className="lance-valor">
              <span>Lance mínimo</span>
              <b className="num">{reais(melhor?.lance_minimo)}</b>
              {desconto != null && desconto > 0 && <span className="selo-desconto estatico">−{porcento(desconto)} da avaliação</span>}
            </div>
            <div className="lance-acoes">
              {assinante ? (
                <>
                  {melhor?.url && <a className="botao" href={`/ir/${melhor.id}`} target="_blank" rel="noopener">Ir ao site do leiloeiro ↗</a>}
                  <button type="button" className="botao secundario" disabled title="Os alertas chegam numa próxima etapa">{textoAlerta}</button>
                </>
              ) : (
                <>
                  <Link className="botao" href="/assinar"><Cadeado /> Ir ao site do leiloeiro</Link>
                  <Link className="botao secundario" href="/assinar"><Cadeado /> {textoAlerta}</Link>
                </>
              )}
            </div>
          </section>

          <section className="painel destaque-assinante">
            <h2>Quanto custa arrematar?</h2>
            <p className="texto">
              Leiloeiro, ITBI, cartório, reforma, imposto na venda: a calculadora soma tudo a partir do lance e mostra o
              lucro e o lance máximo para a sua meta.
            </p>
            <div>
              <Link className="botao" href={assinante ? "/calculadora" : "/assinar"}>
                {assinante ? null : <Cadeado />} Fazer a conta na calculadora
              </Link>
            </div>
          </section>

          <section className="painel">
            <h2>Antes de dar lance</h2>
            <ol className="passos">
              {ANTES_DO_LANCE.map((p) => (
                <li key={p.t}><b>{p.t}</b><span>{p.d}</span></li>
              ))}
            </ol>
          </section>

          {im.lat != null && im.lon != null && (
            <section className="painel" style={{ padding: 0, overflow: "hidden", gap: 0 }}>
              <Mapa
                altura="260px"
                pontos={[{ imovel_id: im.id, lat: im.lat, lon: im.lon, lance_minimo: melhor?.lance_minimo ?? null, tipo: im.tipo, titulo: melhor?.titulo ?? null, desconto_avaliacao: desconto }]}
              />
              <p className="muted" style={{ fontSize: 12, margin: "8px 12px 10px" }}>
                {im.geo_precisao === "endereco"
                  ? "Localização pelo endereço."
                  : im.geo_precisao === "fonte"
                    ? "Localização informada pela fonte."
                    : `Localização aproximada (${im.geo_precisao ?? "sem precisão"}): o ponto pode não ser o imóvel exato.`}
              </p>
            </section>
          )}
        </aside>
      </div>

      {vizinhos.length > 0 && (
        <section className="parecidos">
          <h2>Parecidos em {im.cidade}</h2>
          <div className="grade-cartoes">
            {vizinhos.map((v) => <CardImovel key={v.imovel_id} i={v} />)}
          </div>
        </section>
      )}
    </main>
  );
}
