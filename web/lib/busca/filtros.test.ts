import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarAcesso, contarFiltros, lerFiltros, montarWhere, paraUrl } from "./filtros.ts";

test("lê a URL e descarta o que é inválido", () => {
  const f = lerFiltros(new URLSearchParams("uf=df&tipo=apartamento,xyz&desconto_min=300&fgts=1&bbox=-48,-16,-47,-15&pagina=0"));
  assert.equal(f.uf, "DF");
  assert.deepEqual(f.tipo, ["apartamento"]);
  assert.equal(f.desconto_min, undefined);
  assert.equal(f.fgts, true);
  assert.deepEqual(f.bbox, [-48, -16, -47, -15]);
  assert.equal(f.pagina, 1);
});

test("raio só vale com centro", () => {
  assert.equal(lerFiltros({ raio_km: "10" }).raio_km, undefined);
  const f = lerFiltros({ raio_km: "10", centro: "-15.79,-47.88" });
  assert.equal(f.raio_km, 10);
  assert.deepEqual(f.centro, [-15.79, -47.88]);
});

test("visitante: mapa e página ficam, filtros de assinante saem", () => {
  const f = lerFiltros({ bbox: "-48,-16,-47,-15", uf: "DF", fgts: "1", ordem: "preco", pagina: "2" });
  const { filtros, bloqueados } = aplicarAcesso(f, false);
  assert.deepEqual(filtros, { bbox: [-48, -16, -47, -15], pagina: 2 });
  assert.deepEqual(bloqueados.sort(), ["fgts", "ordem", "uf"]);
  assert.deepEqual(aplicarAcesso(f, true).bloqueados, []);
});

test("SQL usa parâmetros, nunca o texto do usuário", () => {
  const f = lerFiltros({ cidade: "x'; drop table lote; --", comitente: "Caixa Econômica Federal,Santander", sem_dividas: "1" });
  const { where, params } = montarWhere(f);
  assert.ok(!where.includes("drop table"));
  assert.match(where, /comitente = any\(\$2::text\[\]\)/);
  assert.match(where, /debitos_por_conta = 'vendedor'/);
  assert.deepEqual(params[1], ["Caixa Econômica Federal", "Santander"]);
});

test("pontos do mapa ignoram o recorte da tela", () => {
  const f = lerFiltros({ bbox: "-48,-16,-47,-15" });
  assert.equal(montarWhere(f, false).where, "");
  assert.match(montarWhere(f, true).where, /lon between/);
});

test("ida e volta pela URL", () => {
  const f = lerFiltros({ uf: "SP", tipo: "casa,apartamento", financiamento: "1", prazo_dias: "30" });
  assert.deepEqual(lerFiltros(paraUrl(f)), f);
  assert.equal(contarFiltros(f), 4);
});
