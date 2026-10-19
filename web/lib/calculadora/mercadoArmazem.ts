/**
 * Armazém do valor de mercado no Postgres: `mercado_preco` (só se acrescenta; leitura pela view `vw_mercado_atual`)
 * e o teto diário de IA em `mercado_ia_uso_dia`. Falha de banco (ex.: migração 011 ainda não aplicada) nunca derruba
 * a pesquisa: sem leitura, ela segue para o portal; sem gravação, só perde o reaproveitamento; sem contador, a IA
 * não é usada (gastar sem conseguir contar seria pior do que não responder).
 */
import { pool } from "../db.ts";
import type { ArmazemMercado, ChaveRegiao, LinhaMercado } from "./mercadoCore.ts";

const maxIaPorDia = () => Math.max(0, Number(process.env.MERCADO_MAX_IA_DIA ?? 30) || 0);

type Linha = {
  uf: string;
  cidade_chave: string;
  bairro_chave: string;
  tipo: string;
  faixa_min: number;
  faixa_max: number;
  escopo: "bairro" | "cidade";
  fonte: "chaves-na-mao" | "ia";
  preco_m2: number | null;
  p25: number | null;
  p75: number | null;
  n: number;
  motivo: string | null;
  amostras: LinhaMercado["amostras"];
  coletado_em: Date;
};

const paraLinha = (r: Linha): LinhaMercado => ({
  uf: r.uf,
  cidadeChave: r.cidade_chave,
  bairroChave: r.bairro_chave,
  tipo: r.tipo,
  faixaMin: r.faixa_min,
  faixaMax: r.faixa_max,
  escopo: r.escopo,
  fonte: r.fonte,
  precoM2: r.preco_m2,
  p25: r.p25,
  p75: r.p75,
  n: r.n,
  motivo: r.motivo,
  amostras: r.amostras ?? [],
  coletadoEm: r.coletado_em,
});

export const armazemBanco: ArmazemMercado = {
  async ler(c: ChaveRegiao) {
    try {
      const { rows } = await pool.query<Linha>(
        `select * from vw_mercado_atual
         where uf = $1 and cidade_chave = $2 and tipo = $3 and faixa_min = $4 and faixa_max = $5
           and bairro_chave in ($6, '')`,
        [c.uf, c.cidadeChave, c.tipo, c.faixaMin, c.faixaMax, c.bairroChave],
      );
      const linhas = rows.map(paraLinha);
      return {
        bairro: c.bairroChave ? (linhas.find((l) => l.bairroChave === c.bairroChave) ?? null) : null,
        cidade: linhas.find((l) => l.bairroChave === "") ?? null,
      };
    } catch (e) {
      console.error("[mercado] leitura do banco falhou:", e instanceof Error ? e.message : e);
      return { bairro: null, cidade: null };
    }
  },

  async gravar(linhas: LinhaMercado[]) {
    if (!linhas.length) return;
    try {
      const valores: unknown[] = [];
      const grupos = linhas.map((l, i) => {
        valores.push(l.uf, l.cidadeChave, l.bairroChave, l.tipo, l.faixaMin, l.faixaMax, l.escopo, l.fonte, l.precoM2, l.p25, l.p75, l.n, l.motivo, JSON.stringify(l.amostras));
        const b = i * 14;
        return `(${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(", ")})`;
      });
      await pool.query(
        `insert into mercado_preco (uf, cidade_chave, bairro_chave, tipo, faixa_min, faixa_max, escopo, fonte, preco_m2, p25, p75, n, motivo, amostras)
         values ${grupos.join(", ")}`,
        valores,
      );
    } catch (e) {
      console.error("[mercado] gravação no banco falhou:", e instanceof Error ? e.message : e);
    }
  },

  /** Atômico: duas pesquisas ao mesmo tempo não passam do teto. */
  async reservarIA() {
    const teto = maxIaPorDia();
    if (teto <= 0) return false;
    try {
      const { rowCount } = await pool.query(
        `insert into mercado_ia_uso_dia (dia, chamadas) values ((now() at time zone 'America/Sao_Paulo')::date, 1)
         on conflict (dia) do update set chamadas = mercado_ia_uso_dia.chamadas + 1 where mercado_ia_uso_dia.chamadas < $1`,
        [teto],
      );
      return (rowCount ?? 0) > 0;
    } catch (e) {
      console.error("[mercado] contador de IA falhou:", e instanceof Error ? e.message : e);
      return false;
    }
  },
};
