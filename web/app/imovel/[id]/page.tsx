import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Calculadora from "@/components/Calculadora";
import Mapa from "@/components/Mapa";
import { imovel } from "@/lib/consultas";
import { area, MODALIDADES, OCUPACAO, porcento, quando, reais, TIPOS } from "@/lib/formato";

export const dynamic = "force-dynamic";

const EVENTOS: Record<string, string> = {
  novo: "Entrou na base",
  alterado: "Alterado",
  removido: "Saiu da fonte",
  reaparecido: "Voltou à fonte",
};

async function carregar(params: Promise<{ id: string }>) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  return imovel(n);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await carregar(params);
  if (!d) return {};
  const im = d.imovel;
  return { title: `${TIPOS[im.tipo] ?? "Imóvel"} em leilão · ${im.bairro ?? ""} ${im.cidade ?? ""}/${im.uf ?? ""}` };
}

export default async function PaginaImovel({ params }: { params: Promise<{ id: string }> }) {
  const d = await carregar(params);
  if (!d) notFound();
  const { imovel: im, lotes, historico } = d;
  const ativos = lotes.filter((l) => l.status === "ativo" || l.status === "suspenso");
  const melhor = ativos[0] ?? lotes[0];
  const fotos = [...new Set(lotes.flatMap((l) => l.fotos ?? []))].slice(0, 12);
  // ocupação consolidada entre fontes: 'ocupado' prevalece (conservador), depois 'desocupado'
  const base = ativos.length ? ativos : lotes;
  const ocupacao = base.some((l) => l.ocupacao === "ocupado")
    ? "ocupado"
    : base.some((l) => l.ocupacao === "desocupado")
      ? "desocupado"
      : "nao_informado";
  const ocup = OCUPACAO[ocupacao];
  const descricao = base.map((l) => l.descricao).filter(Boolean).sort((a, b) => b!.length - a!.length)[0];
  const desconto =
    melhor?.valor_avaliacao && melhor?.lance_minimo ? 1 - melhor.lance_minimo / melhor.valor_avaliacao : null;

  return (
    <main className="pagina">
      <Link href="/" className="muted" style={{ fontSize: 13 }}>
        ← Voltar à busca
      </Link>
      <div style={{ marginTop: 8 }}>
        <span className="rotulo">
          {TIPOS[im.tipo] ?? "Imóvel"} · {MODALIDADES[melhor?.modalidade ?? ""] ?? ""} · {im.cidade}/{im.uf}
        </span>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>{melhor?.titulo ?? im.endereco}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {[im.endereco, im.bairro, im.cidade && `${im.cidade}/${im.uf}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="ficha">
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {fotos.length > 0 && (
            <div className="galeria">
              {fotos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f} src={f} alt="" loading="lazy" />
              ))}
            </div>
          )}

          <section className="painel">
            <div className="dados">
              <div className="dado">
                <span>Lance mínimo agora</span>
                <b>{reais(melhor?.lance_minimo)}</b>
              </div>
              <div className="dado">
                <span>Avaliação do edital</span>
                <b>{reais(melhor?.valor_avaliacao)}</b>
              </div>
              <div className="dado">
                <span>Desconto sobre avaliação</span>
                <b className="bom">{porcento(desconto)}</b>
              </div>
              <div className="dado">
                <span>Valor de mercado</span>
                <b className="muted">em breve</b>
              </div>
              {area(im.area_privativa) && (
                <div className="dado">
                  <span>Área privativa</span>
                  <b>{area(im.area_privativa)}</b>
                </div>
              )}
              {area(im.area_terreno) && (
                <div className="dado">
                  <span>Área do terreno</span>
                  <b>{area(im.area_terreno)}</b>
                </div>
              )}
              {im.quartos != null && (
                <div className="dado">
                  <span>Quartos / vagas</span>
                  <b>
                    {im.quartos} / {im.vagas ?? "—"}
                  </b>
                </div>
              )}
              <div className="dado">
                <span>Ocupação</span>
                <b>
                  <span className={`chip ${ocup.classe}`}>{ocup.rotulo}</span>
                </b>
              </div>
              {im.matricula && (
                <div className="dado">
                  <span>Matrícula</span>
                  <b>
                    {im.matricula}
                    {im.cartorio ? <small className="muted"> · {im.cartorio}</small> : null}
                  </b>
                </div>
              )}
            </div>
            {ocupacao === "nao_informado" && (
              <p className="aviso">
                A fonte não informa se o imóvel está ocupado. Isso não significa que está livre: confirme no edital e,
                se possível, visite antes de dar lance.
              </p>
            )}
            {descricao && <p style={{ margin: 0 }}>{descricao}</p>}
          </section>

          <section className="painel">
            <h2>Onde está anunciado ({lotes.length})</h2>
            {lotes.map((l, i) => (
              <div key={l.id} className={`fonte-lote ${i === 0 && ativos.length ? "melhor" : ""}`}>
                <div className="linha">
                  <strong>{l.fonte_nome}</strong>
                  <span className="num">{reais(l.lance_minimo)}</span>
                </div>
                <div className="chips" style={{ marginTop: 0 }}>
                  <span className="chip">{MODALIDADES[l.modalidade] ?? l.modalidade}</span>
                  <span className={`chip ${l.status === "ativo" ? "chip-bom" : "chip-aviso"}`}>{l.status}</span>
                  {l.data_praca1 && (
                    <span className="chip">
                      1ª praça {quando(l.data_praca1)} · {reais(l.valor_praca1)}
                    </span>
                  )}
                  {l.data_praca2 && (
                    <span className="chip">
                      2ª praça {quando(l.data_praca2)} · {reais(l.valor_praca2)}
                    </span>
                  )}
                </div>
                <div className="linha muted" style={{ fontSize: 12 }}>
                  <span>
                    {l.processo ? `Processo ${l.processo} · ` : ""}visto de {quando(l.primeiro_visto_em)} a{" "}
                    {quando(l.ultimo_visto_em)}
                  </span>
                  <span style={{ display: "flex", gap: 10 }}>
                    {l.edital_url && (
                      <a href={l.edital_url} target="_blank" rel="noopener noreferrer">
                        Edital
                      </a>
                    )}
                    {l.url && (
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        Ver no site oficial ↗
                      </a>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="painel">
            <h2>Histórico</h2>
            <div className="tabela">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Fonte</th>
                    <th>Evento</th>
                    <th>Praça</th>
                    <th>Lance mínimo</th>
                  </tr>
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
          </section>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <section className="painel">
            <h2>Quanto custa arrematar</h2>
            <Calculadora lance={melhor?.lance_minimo ?? null} avaliacao={melhor?.valor_avaliacao ?? null} uf={im.uf} />
          </section>
          {im.lat != null && im.lon != null && (
            <section className="painel" style={{ padding: 0, overflow: "hidden" }}>
              <Mapa
                altura="280px"
                pontos={[
                  {
                    imovel_id: im.id,
                    lat: im.lat,
                    lon: im.lon,
                    lance_minimo: melhor?.lance_minimo ?? null,
                    tipo: im.tipo,
                    titulo: melhor?.titulo ?? null,
                    desconto_avaliacao: desconto,
                  },
                ]}
              />
              <p className="muted" style={{ fontSize: 12, margin: "0 12px 10px" }}>
                Localização {im.geo_precisao === "endereco" ? "pelo endereço" : `aproximada (${im.geo_precisao})`}.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
