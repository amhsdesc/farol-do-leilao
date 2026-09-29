import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemEvento, mensagemLembrete, tituloImovel } from "./mensagens.ts";

const IMOVEL = { tipo: "apartamento", cidade: "Brasilia", uf: "DF", bairro: "Asa Norte", lanceMinimo: 300000, dataLeilao: "2026-10-29T10:00:00-03:00" };

test("tituloImovel monta tipo, bairro, cidade e uf", () => {
  assert.equal(tituloImovel(IMOVEL), "Apartamento em Asa Norte, Brasilia/DF");
  assert.equal(tituloImovel({ ...IMOVEL, bairro: null }), "Apartamento, Brasilia/DF");
  assert.equal(tituloImovel({ ...IMOVEL, tipo: null }), "Imóvel em Asa Norte, Brasilia/DF");
});

test("mensagemEvento preco: diz que caiu quando o valor novo é menor", () => {
  const m = mensagemEvento("preco", 7, IMOVEL, "300000", "250000", "https://exemplo.com");
  assert.match(m.assunto, /Lance caiu/);
  assert.match(m.texto, /https:\/\/exemplo\.com\/imovel\/7/);
});

test("mensagemEvento preco: diz que mudou quando o valor novo é maior", () => {
  const m = mensagemEvento("preco", 7, IMOVEL, "250000", "300000", "https://exemplo.com");
  assert.match(m.assunto, /Lance mudou/);
});

test("mensagemEvento data", () => {
  const m = mensagemEvento("data", 7, IMOVEL, "2026-10-01T10:00:00-03:00", "2026-10-15T10:00:00-03:00", "https://exemplo.com");
  assert.match(m.assunto, /Data do leilão mudou/);
});

test("mensagemEvento suspenso e indisponivel", () => {
  assert.match(mensagemEvento("suspenso", 7, IMOVEL, null, null, "https://exemplo.com").assunto, /suspenso/);
  assert.match(mensagemEvento("indisponivel", 7, IMOVEL, null, null, "https://exemplo.com").assunto, /não está mais disponível/);
});

test("mensagemLembrete usa o rótulo certo por faixa", () => {
  assert.match(mensagemLembrete("lembrete_7d", 7, IMOVEL, "https://exemplo.com").assunto, /em 7 dias/);
  assert.match(mensagemLembrete("lembrete_1d", 7, IMOVEL, "https://exemplo.com").assunto, /amanhã/);
  assert.match(mensagemLembrete("lembrete_1h", 7, IMOVEL, "https://exemplo.com").texto, /daqui a pouco/);
});
