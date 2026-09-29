// Rodar: node --experimental-strip-types --test lib/calculadora/calcular.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { aliquotaItbi, calcular, custoReformaM2, impostoGanhoCapital, lanceMaximo } from "./calcular.ts";

const exemplo = {
  lance: 275_000,
  uf: "DF",
  cidade: "Brasília",
  modalidade: "extrajudicial" as const,
  area: 62,
  valorMercado: 428_000,
  reformaPadrao: "simples" as const,
  mesesAteVender: 10,
  condominioMensal: 450,
  iptuMensal: 120,
};

test("ITBI por cidade, DF usado e novo, fallback conservador", () => {
  assert.deepEqual(aliquotaItbi("DF", "Águas Claras"), { pct: 2, achou: true });
  assert.deepEqual(aliquotaItbi("DF", null, true), { pct: 1, achou: true });
  assert.deepEqual(aliquotaItbi("PR", "Curitiba"), { pct: 2.7, achou: true });
  assert.deepEqual(aliquotaItbi("GO", "Luziânia"), { pct: 3, achou: false });
});

test("reforma usa o meio da faixa e o ajuste regional", () => {
  assert.equal(custoReformaM2("simples", "DF"), 650);
  assert.equal(custoReformaM2("medio", "SP"), 1440);
  assert.equal(custoReformaM2("nenhuma", "SP"), 0);
});

test("IR progressivo por faixa do ganho", () => {
  assert.equal(impostoGanhoCapital(100_000), 15_000);
  assert.equal(impostoGanhoCapital(6_000_000), 750_000 + 175_000);
  assert.equal(impostoGanhoCapital(-5), 0);
});

test("conta completa de um apartamento no DF", () => {
  const r = calcular(exemplo);
  const v = Object.fromEntries(r.itens.map((i) => [i.id, i.valor]));
  assert.equal(v.leiloeiro, 13_750);
  assert.equal(v.advogado, 5_500);
  assert.equal(v.itbi, 5_500);
  assert.equal(v.escritura, 2_196.48);   // faixa R$ 200 mil a R$ 343 mil
  assert.equal(v.registro, 1_263.84);    // faixa R$ 263 mil a R$ 286 mil
  assert.equal(v.reforma, 40_300);       // 62 m² × R$ 650
  assert.equal(v.condominio, 4_500);
  assert.equal(v.corretagem, 25_680);
  const esperado = 275_000 + 13_750 + 5_500 + 5_500 + 2_196.48 + 1_263.84 + 800 + 40_300 + 4_500 + 1_200;
  assert.equal(r.investimentoTotal, Math.round(esperado * 100) / 100);
  // IR: venda 428.000 − corretagem 25.680 − custo de aquisição dedutível
  const aquisicao = 275_000 + 13_750 + 5_500 + 2_196.48 + 1_263.84 + 800 + 40_300;
  assert.equal(r.impostoRenda, Math.round((428_000 - 25_680 - aquisicao) * 0.15 * 100) / 100);
  assert.ok(r.lucro > 0 && r.retornoPct > 0 && r.descontoRealPct > 0);
});

test("cartório por UF: SP e MG usam tabela real de registro; outros estados caem no percentual", () => {
  const sp = calcular({ ...exemplo, uf: "SP", cidade: "São Paulo" });
  assert.equal(sp.itens.find((i) => i.id === "registro")?.valor, 2_723.02); // faixa 268.940,01–307.360
  assert.match(sp.itens.find((i) => i.id === "registro")?.detalhe ?? "", /tabela oficial de SP/);
  // escritura de SP ainda não tem tabela real: cai no percentual de partida
  assert.equal(sp.itens.find((i) => i.id === "escritura")?.valor, (275_000 * 1) / 100);

  const mg = calcular({ ...exemplo, uf: "MG", cidade: "Belo Horizonte" });
  assert.equal(mg.itens.find((i) => i.id === "registro")?.valor, 4_843.46); // faixa 210.000,01–280.000

  const outro = calcular({ ...exemplo, uf: "GO", cidade: "Goiânia" });
  assert.equal(outro.itens.find((i) => i.id === "registro")?.valor, (275_000 * 0.6) / 100);
  assert.match(outro.itens.find((i) => i.id === "registro")?.detalhe ?? "", /tabela de GO ainda não está na calculadora/);
});

test("leilão judicial não tem escritura", () => {
  const r = calcular({ ...exemplo, modalidade: "judicial" });
  assert.ok(!r.itens.some((i) => i.id === "escritura"));
  assert.equal(r.itens.find((i) => i.id === "registro")?.rotulo, "Registro da carta de arrematação");
});

test("isenção do único imóvel só vale até R$ 440 mil", () => {
  assert.equal(calcular({ ...exemplo, isencaoUnicoImovel: true }).impostoRenda, 0);
  assert.ok(calcular({ ...exemplo, valorMercado: 600_000, isencaoUnicoImovel: true }).impostoRenda > 0);
});

test("lance máximo entrega a meta e um real a mais já não entrega", () => {
  const max = lanceMaximo(exemplo, 20)!;
  assert.ok(max > 0 && max < 428_000);
  const noMax = calcular({ ...exemplo, lance: max });
  const acima = calcular({ ...exemplo, lance: max + 2_000 });
  assert.ok(noMax.retornoPct >= 20, `retorno no máximo: ${noMax.retornoPct}`);
  assert.ok(acima.retornoPct < 20, `retorno acima: ${acima.retornoPct}`);
  assert.equal(calcular({ ...exemplo, metaRetornoPct: 20 }).lanceMaximo, max);
});

test("meta impossível devolve zero; sem valor de mercado devolve null", () => {
  assert.equal(lanceMaximo({ ...exemplo, valorMercado: 50_000 }, 30), 0);
  assert.equal(lanceMaximo({ ...exemplo, valorMercado: undefined, precoM2Regiao: undefined }, 20), null);
});

test("valor de mercado pelo preço do m² da região", () => {
  const r = calcular({ ...exemplo, valorMercado: undefined, precoM2Regiao: 7_000 });
  assert.equal(r.valorMercado, 434_000);
});

test("advogado: mínimo de R$ 4.000 quando 2% do lance fica abaixo disso", () => {
  const baixo = calcular({ ...exemplo, lance: 100_000 }); // 2% = 2.000, abaixo do piso
  assert.equal(baixo.itens.find((i) => i.id === "advogado")?.valor, 4_000);
  assert.match(baixo.itens.find((i) => i.id === "advogado")?.detalhe ?? "", /mínimo de R\$ 4.000/);

  const alto = calcular({ ...exemplo, lance: 500_000 }); // 2% = 10.000, acima do piso
  assert.equal(alto.itens.find((i) => i.id === "advogado")?.valor, 10_000);

  const fixo = calcular({ ...exemplo, lance: 100_000, advogadoFixo: 1_500 }); // valor fixo informado não sofre o piso
  assert.equal(fixo.itens.find((i) => i.id === "advogado")?.valor, 1_500);
});
