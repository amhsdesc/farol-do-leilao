import Link from "next/link";
import Mapa from "@/components/Mapa";
import { buscar, opcoesFiltro, POR_PAGINA, type Filtros } from "@/lib/consultas";
import { area, MODALIDADES, OCUPACAO, porcento, proximaPraca, reais, TIPOS } from "@/lib/formato";

export const dynamic = "force-dynamic";

function linkPagina(f: Filtros, pagina: number) {
  const p = new URLSearchParams(Object.entries({ ...f, pagina: String(pagina) }).filter(([, v]) => v) as [string, string][]);
  return `/?${p.toString()}`;
}

export default async function Busca({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const [{ itens, total, pontos, pagina }, opcoes] = await Promise.all([buscar(f), opcoesFiltro()]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <main className="pagina">
      <form className="filtros" method="get" action="/">
        <label className="largo">
          Busca
          <input name="q" defaultValue={f.q} placeholder="bairro, rua, quadra…" />
        </label>
        <label>
          UF
          <select name="uf" defaultValue={f.uf ?? ""}>
            <option value="">Todas</option>
            {opcoes.ufs.map((u) => (
              <option key={u.uf} value={u.uf}>
                {u.uf} ({u.n})
              </option>
            ))}
          </select>
        </label>
        <label className="curto">
          Cidade
          <input name="cidade" defaultValue={f.cidade} />
        </label>
        <label>
          Tipo
          <select name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modalidade
          <select name="modalidade" defaultValue={f.modalidade ?? ""}>
            <option value="">Todas</option>
            {Object.entries(MODALIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ocupação
          <select name="ocupacao" defaultValue={f.ocupacao ?? ""}>
            <option value="">Qualquer</option>
            <option value="desocupado">Desocupado</option>
            <option value="ocupado">Ocupado</option>
            <option value="nao_informado">Não informada</option>
          </select>
        </label>
        <label className="curto">
          Preço até (R$)
          <input name="preco_max" type="number" min="0" step="10000" defaultValue={f.preco_max} />
        </label>
        <label className="curto">
          Desconto mín. (%)
          <input name="desconto_min" type="number" min="0" max="95" defaultValue={f.desconto_min} />
        </label>
        <label>
          Fonte
          <select name="fonte" defaultValue={f.fonte ?? ""}>
            <option value="">Todas</option>
            {opcoes.fontes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} ({o.n})
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar
          <select name="ordem" defaultValue={f.ordem ?? "desconto"}>
            <option value="desconto">Maior desconto</option>
            <option value="preco">Menor preço</option>
            <option value="praca">Praça mais próxima</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </label>
        <button className="botao" type="submit">
          Filtrar
        </button>
        <Link className="botao secundario" href="/">
          Limpar
        </Link>
      </form>

      <div className="busca">
        <section>
          <div className="resumo">
            <h1 className="num">{total.toLocaleString("pt-BR")} imóveis em leilão</h1>
            <span className="muted" style={{ fontSize: 13 }}>
              Desconto calculado sobre a avaliação do edital. Valor de mercado entra na próxima fase.
            </span>
          </div>
          {itens.length === 0 ? (
            <div className="vazio">
              Nenhum imóvel com esses filtros. Tente ampliar a região ou tirar o limite de preço.
            </div>
          ) : (
            <div className="lista">
              {itens.map((i) => {
                const ocup = OCUPACAO[i.ocupacao] ?? OCUPACAO.nao_informado;
                const praca = proximaPraca(i);
                return (
                  <Link key={i.imovel_id} href={`/imovel/${i.imovel_id}`} className="card">
                    <div className="foto" style={i.foto ? { backgroundImage: `url(${i.foto})` } : undefined}>
                      {i.foto ? null : TIPOS[i.tipo] ?? "Imóvel"}
                    </div>
                    <div>
                      <h3>{i.titulo ?? `${TIPOS[i.tipo] ?? "Imóvel"} em ${i.bairro ?? i.cidade ?? ""}`}</h3>
                      <div className="local">
                        {[i.bairro, i.cidade && `${i.cidade}/${i.uf}`].filter(Boolean).join(" · ")}
                        {area(i.area) ? ` · ${area(i.area)}` : ""}
                        {i.quartos ? ` · ${i.quartos} qto${i.quartos > 1 ? "s" : ""}` : ""}
                      </div>
                      <div className="chips">
                        {i.modalidade !== "outros" && <span className="chip">{MODALIDADES[i.modalidade] ?? i.modalidade}</span>}
                        {praca && <span className="chip">{praca}</span>}
                        <span className={`chip ${ocup.classe}`}>{ocup.rotulo}</span>
                        {i.n_fontes > 1 && <span className="chip chip-fontes">{i.n_fontes} fontes</span>}
                        {i.status === "suspenso" && <span className="chip chip-ruim">Suspenso</span>}
                      </div>
                    </div>
                    <div className="preco">
                      <b>{reais(i.lance_minimo)}</b>
                      {i.valor_avaliacao ? <s>aval. {reais(i.valor_avaliacao)}</s> : null}
                      {i.desconto_avaliacao != null && i.desconto_avaliacao > 0 && (
                        <div className="desc">−{porcento(i.desconto_avaliacao)}</div>
                      )}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {i.fonte_nome}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {paginas > 1 && (
            <nav className="paginacao" aria-label="Páginas">
              {pagina > 1 && (
                <Link className="botao secundario" href={linkPagina(f, pagina - 1)}>
                  Anterior
                </Link>
              )}
              <span className="muted num">
                Página {pagina} de {paginas}
              </span>
              {pagina < paginas && (
                <Link className="botao secundario" href={linkPagina(f, pagina + 1)}>
                  Próxima
                </Link>
              )}
            </nav>
          )}
        </section>
        <aside className="mapa-caixa">
          <Mapa pontos={pontos} />
        </aside>
      </div>
    </main>
  );
}
