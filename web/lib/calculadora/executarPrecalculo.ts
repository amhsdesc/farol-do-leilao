// Roda uma vez: calcula o valor de mercado das regiões com imóvel ativo, imprime um resumo e sai.
// Uso: npm run mercado   (agendado toda semana pelo workflow "Valor de mercado"; nunca usa IA)
import { pool } from "../db.ts";
import { armazemBanco } from "./mercadoArmazem.ts";
import { TIPOS_COBERTOS } from "./mercadoMcp.ts";
import { precalcularMercado, type Atual, type Demanda } from "./precalcularMercado.ts";

async function main() {
  const demanda = (
    await pool.query<Demanda>(
      `select uf, cidade, bairro, tipo, area::float8 as area
       from vw_busca
       where uf is not null and cidade is not null and area > 0 and tipo = any($1)`,
      [TIPOS_COBERTOS],
    )
  ).rows;
  const atuais = (
    await pool.query<Atual>(
      `select uf, cidade_chave as "cidadeChave", bairro_chave as "bairroChave", tipo,
              faixa_min as "faixaMin", faixa_max as "faixaMax", preco_m2 as "precoM2", coletado_em as "coletadoEm"
       from vw_mercado_atual`,
    )
  ).rows;
  const r = await precalcularMercado({
    demanda,
    atuais,
    armazem: armazemBanco,
    maxResolucoes: Number(process.env.MERCADO_PRECALC_MAX ?? 120) || 120,
    limiteMs: (Number(process.env.MERCADO_PRECALC_MINUTOS ?? 40) || 40) * 60_000,
    aoProgredir: (m) => console.log(m),
  });
  console.log(
    `mercado: ${r.regioes} regiões com imóvel ativo, ${r.pendentes} pendentes, ${r.resolvidas} gravações ` +
      `(${r.comPreco} com preço, ${r.semDados} sem anúncios suficientes); parou por: ${r.paradoPor}`,
  );
}

main()
  .catch((e) => {
    console.error("mercado: erro", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
