import assert from "node:assert/strict";
import { test } from "node:test";
import { cpfValido, economia, limiteAlertas, normalizarCelular, novoPagoAte, PLANOS, porMes, situacao, temAcesso } from "./regras.ts";

const d = (s: string) => new Date(s);

test("preços e economia", () => {
  assert.equal(porMes(PLANOS.trimestral), 36.63);
  assert.equal(porMes(PLANOS.anual), 33.33);
  assert.equal(Math.round(economia(PLANOS.trimestral) * 100), 18);
  assert.equal(Math.round(economia(PLANOS.anual) * 100), 26);
  assert.equal(economia(PLANOS.mensal), 0);
});

test("acesso: teste grátis, pago, tolerância e vencido", () => {
  const agora = d("2026-10-10T12:00:00Z");
  assert.equal(temAcesso(null, agora), false);
  assert.equal(temAcesso({ status: "teste", plano: null, teste_ate: "2026-10-11T00:00:00Z", pago_ate: null }, agora), true);
  assert.equal(temAcesso({ status: "teste", plano: null, teste_ate: "2026-10-09T00:00:00Z", pago_ate: null }, agora), false);
  assert.equal(temAcesso({ status: "atrasada", plano: "mensal", teste_ate: null, pago_ate: "2026-10-08T12:00:00Z" }, agora), true);
  assert.equal(temAcesso({ status: "atrasada", plano: "mensal", teste_ate: null, pago_ate: "2026-10-06T12:00:00Z" }, agora), false);
});

test("situação para a página de planos", () => {
  const agora = d("2026-10-10T12:00:00Z");
  assert.equal(situacao(null, null, agora).tipo, "sem_conta");
  assert.equal(situacao({ telefone_validado_em: null }, null, agora).tipo, "sem_celular");
  const u = { telefone_validado_em: "2026-10-01" };
  assert.equal(situacao(u, null, agora).tipo, "pode_testar");
  assert.equal(situacao(u, { status: "teste", plano: null, teste_ate: "2026-10-12", pago_ate: null }, agora).tipo, "em_teste");
  assert.equal(situacao(u, { status: "teste", plano: null, teste_ate: "2026-10-01", pago_ate: null }, agora).tipo, "vencida");
  const ativa = situacao(u, { status: "cancelada", plano: "anual", teste_ate: null, pago_ate: "2027-01-01" }, agora);
  assert.deepEqual(ativa.tipo === "ativa" && ativa.cancelada, true);
});

test("renovação soma o ciclo sem perder dias", () => {
  const r = novoPagoAte(PLANOS.trimestral, d("2026-11-05T00:00:00Z"), d("2026-11-05T00:00:00Z"), d("2026-11-01T00:00:00Z"));
  assert.equal(r.toISOString().slice(0, 10), "2027-02-05");
  // pagou atrasado: conta a partir de hoje
  const r2 = novoPagoAte(PLANOS.mensal, d("2026-09-01T00:00:00Z"), d("2026-09-01T00:00:00Z"), d("2026-09-20T00:00:00Z"));
  assert.equal(r2.toISOString().slice(0, 10), "2026-10-20");
});

test("celular", () => {
  assert.equal(normalizarCelular("(61) 99999-8888"), "+5561999998888");
  assert.equal(normalizarCelular("+55 61 9 9999 8888"), "+5561999998888");
  assert.equal(normalizarCelular("061999998888"), "+5561999998888");
  assert.equal(normalizarCelular("(61) 3333-4444"), null); // fixo
  assert.equal(normalizarCelular("999"), null);
});

test("CPF", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("529.982.247-24"), false);
});

test("limite de alertas por plano", () => {
  assert.equal(limiteAlertas("mensal"), 2);
  assert.equal(limiteAlertas("trimestral"), 5);
  assert.equal(limiteAlertas("anual"), null);
  assert.equal(limiteAlertas(null), 2); // sem plano (ex.: teste grátis) usa o limite do mensal
  assert.equal(limiteAlertas("plano-inexistente"), 2);
});
