"use client";

import Link from "next/link";
import type { Filtros } from "@/lib/busca/filtros";
import { MODALIDADES, TIPOS } from "@/lib/formato";

export type Opcoes = {
  ufs: { uf: string; n: number }[];
  comitentes: { comitente: string; n: number }[];
  leiloeiros: { leiloeiro: string; n: number }[];
};

export function Cadeado({ tamanho = 13 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** O que o visitante vê: os grupos de filtro, travados, e o convite para assinar. */
export function FiltrosTravados() {
  const grupos = ["Estado e cidade", "Banco ou vendedor", "Valor do lance", "Desconto mínimo", "Quando é o leilão", "Ocupação e dívidas"];
  return (
    <div className="painel-filtros travado">
      <div className="painel-topo">
        <h2>Filtros</h2>
        <span className="selo-assinante"><Cadeado /> Para assinantes</span>
      </div>
      <div className="travado-previa" aria-hidden="true">
        {grupos.map((g) => (
          <div key={g} className="previa-grupo">
            <span>{g}</span>
            <div className="previa-campo" />
          </div>
        ))}
        <div className="previa-grupo linha">
          <span className="previa-chip">Aceita FGTS</span>
          <span className="previa-chip">Financiamento</span>
        </div>
      </div>
      <div className="convite">
        <b>Filtre por banco, valor, FGTS, financiamento, data do leilão e mais 15 critérios.</b>
        <span>Assinantes também usam a calculadora e recebem alertas antes de cada leilão.</span>
        <Link className="botao" href="/assinar">Testar 7 dias grátis</Link>
      </div>
    </div>
  );
}

type Props = {
  filtros: Filtros;
  opcoes: Opcoes;
  centroMapa: [number, number] | null;
  mudar: (parcial: Partial<Filtros>) => void;
  limpar: () => void;
  total: number | null;
};

function alternar(lista: string[] | undefined, v: string) {
  const s = new Set(lista ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return s.size ? [...s] : undefined;
}

function Numero({ rotulo, valor, onValor, passo = 1000, placeholder }: {
  rotulo: string; valor?: number; onValor: (v?: number) => void; passo?: number; placeholder?: string;
}) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={passo}
        placeholder={placeholder}
        defaultValue={valor ?? ""}
        onChange={(e) => onValor(e.target.value ? Number(e.target.value) : undefined)}
      />
    </label>
  );
}

function Marcar({ rotulo, ajuda, valor, onValor }: { rotulo: string; ajuda?: string; valor?: boolean; onValor: (v?: boolean) => void }) {
  return (
    <label className="marcar">
      <input type="checkbox" checked={!!valor} onChange={(e) => onValor(e.target.checked || undefined)} />
      <span>
        {rotulo}
        {ajuda && <small>{ajuda}</small>}
      </span>
    </label>
  );
}

export default function PainelFiltros({ filtros: f, opcoes, centroMapa, mudar, limpar, total }: Props) {
  const tiposUsados: (keyof typeof TIPOS)[] = ["apartamento", "casa", "terreno", "comercial", "galpao", "rural"];
  return (
    <form className="painel-filtros" onSubmit={(e) => e.preventDefault()} aria-label="Filtros da busca">
      <div className="painel-topo">
        <h2>Filtros</h2>
        <button type="button" className="link" onClick={limpar}>Limpar tudo</button>
      </div>

      <fieldset>
        <legend>Onde</legend>
        <label className="campo">
          <span>Estado</span>
          <select value={f.uf ?? ""} onChange={(e) => mudar({ uf: e.target.value || undefined })}>
            <option value="">Todos</option>
            {opcoes.ufs.map((u) => (
              <option key={u.uf} value={u.uf}>{u.uf} ({u.n})</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Cidade</span>
          <input defaultValue={f.cidade ?? ""} placeholder="Ex.: Goiânia" onChange={(e) => mudar({ cidade: e.target.value.trim() || undefined })} />
        </label>
        <label className="campo">
          <span>Distância do centro do mapa</span>
          <select
            value={f.raio_km ?? ""}
            onChange={(e) => {
              const raio = e.target.value ? Number(e.target.value) : undefined;
              mudar({ raio_km: raio, centro: raio ? (f.centro ?? centroMapa ?? undefined) : undefined });
            }}
          >
            <option value="">Qualquer</option>
            {[2, 5, 10, 20, 50].map((k) => (
              <option key={k} value={k}>Até {k} km</option>
            ))}
          </select>
        </label>
        {f.raio_km && centroMapa && (
          <button type="button" className="link" onClick={() => mudar({ centro: centroMapa })}>
            Usar o centro atual do mapa
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Quem vende</legend>
        <div className="opcoes-lista">
          {opcoes.comitentes.slice(0, 10).map((c) => (
            <Marcar
              key={c.comitente}
              rotulo={`${c.comitente} (${c.n})`}
              valor={f.comitente?.includes(c.comitente)}
              onValor={() => mudar({ comitente: alternar(f.comitente, c.comitente) })}
            />
          ))}
        </div>
        <div className="pilulas" role="group" aria-label="Modalidade">
          {(["judicial", "extrajudicial", "venda_direta", "licitacao"] as const).map((m) => (
            <button
              type="button"
              key={m}
              className={`pilula${f.modalidade?.includes(m) ? " ligada" : ""}`}
              aria-pressed={!!f.modalidade?.includes(m)}
              onClick={() => mudar({ modalidade: alternar(f.modalidade, m) })}
            >
              {MODALIDADES[m]}
            </button>
          ))}
        </div>
        <label className="campo">
          <span>Leiloeiro</span>
          <input list="lista-leiloeiros" defaultValue={f.leiloeiro ?? ""} placeholder="Nome do leiloeiro"
            onChange={(e) => mudar({ leiloeiro: e.target.value.trim() || undefined })} />
          <datalist id="lista-leiloeiros">
            {opcoes.leiloeiros.map((l) => <option key={l.leiloeiro} value={l.leiloeiro} />)}
          </datalist>
        </label>
      </fieldset>

      <fieldset>
        <legend>Quanto</legend>
        <div className="dupla">
          <Numero rotulo="Lance de (R$)" valor={f.lance_min} passo={10000} onValor={(v) => mudar({ lance_min: v })} />
          <Numero rotulo="até (R$)" valor={f.lance_max} passo={10000} onValor={(v) => mudar({ lance_max: v })} />
        </div>
        <label className="campo">
          <span>Desconto mínimo sobre a avaliação</span>
          <select value={f.desconto_min ?? ""} onChange={(e) => mudar({ desconto_min: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Qualquer</option>
            {[20, 30, 40, 50, 60].map((d) => <option key={d} value={d}>{d}% ou mais</option>)}
          </select>
        </label>
        <Numero rotulo="Preço por m² até (R$)" valor={f.m2_max} passo={500} onValor={(v) => mudar({ m2_max: v })} />
      </fieldset>

      <fieldset>
        <legend>Como pagar</legend>
        <Marcar rotulo="Aceita FGTS" valor={f.fgts} onValor={(v) => mudar({ fgts: v })} />
        <Marcar rotulo="Aceita financiamento" valor={f.financiamento} onValor={(v) => mudar({ financiamento: v })} />
        <Marcar rotulo="Aceita parcelamento" ajuda="Pagar o lance em parcelas, direto com o vendedor ou o juiz." valor={f.parcelamento} onValor={(v) => mudar({ parcelamento: v })} />
      </fieldset>

      <fieldset>
        <legend>Quando</legend>
        <label className="campo">
          <span>Leilão nos próximos</span>
          <select value={f.prazo_dias ?? ""} onChange={(e) => mudar({ prazo_dias: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Qualquer data</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
          </select>
        </label>
        <Marcar rotulo="Só 2ª praça" ajuda="A segunda tentativa de venda, com lance mínimo menor." valor={f.so_2a_praca} onValor={(v) => mudar({ so_2a_praca: v })} />
        <Marcar rotulo="Novos nesta semana" valor={f.novos} onValor={(v) => mudar({ novos: v })} />
      </fieldset>

      <fieldset>
        <legend>O imóvel</legend>
        <div className="pilulas" role="group" aria-label="Tipo de imóvel">
          {tiposUsados.map((t) => (
            <button type="button" key={t} className={`pilula${f.tipo?.includes(t) ? " ligada" : ""}`}
              aria-pressed={!!f.tipo?.includes(t)} onClick={() => mudar({ tipo: alternar(f.tipo, t) })}>
              {TIPOS[t]}
            </button>
          ))}
        </div>
        <div className="dupla">
          <label className="campo">
            <span>Quartos</span>
            <select value={f.quartos_min ?? ""} onChange={(e) => mudar({ quartos_min: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Qualquer</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} ou mais</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Vagas</span>
            <select value={f.vagas_min ?? ""} onChange={(e) => mudar({ vagas_min: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Qualquer</option>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n} ou mais</option>)}
            </select>
          </label>
        </div>
        <div className="dupla">
          <Numero rotulo="Área de (m²)" valor={f.area_min} passo={10} onValor={(v) => mudar({ area_min: v })} />
          <Numero rotulo="até (m²)" valor={f.area_max} passo={10} onValor={(v) => mudar({ area_max: v })} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Menos risco</legend>
        <Marcar rotulo="Só desocupados" ajuda="Quando a fonte diz que não mora ninguém." valor={f.desocupado} onValor={(v) => mudar({ desocupado: v })} />
        <Marcar rotulo="Dívidas ficam com o vendedor" ajuda="IPTU e condomínio atrasados não passam para você, segundo a fonte." valor={f.sem_dividas} onValor={(v) => mudar({ sem_dividas: v })} />
        <Marcar rotulo="Preço caiu nos últimos 30 dias" valor={f.preco_caiu} onValor={(v) => mudar({ preco_caiu: v })} />
        <Marcar rotulo="Anunciado em mais de um site" ajuda="Dá para conferir os dados em duas fontes." valor={f.varias_fontes} onValor={(v) => mudar({ varias_fontes: v })} />
        <Marcar rotulo="Com fotos" valor={f.com_fotos} onValor={(v) => mudar({ com_fotos: v })} />
      </fieldset>

      <div className="painel-rodape">
        <span className="num">{total == null ? "…" : `${total.toLocaleString("pt-BR")} imóveis`}</span>
      </div>
    </form>
  );
}
