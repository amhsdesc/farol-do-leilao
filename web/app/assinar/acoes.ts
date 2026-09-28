"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { modoTeste } from "@/auth";
import { acesso } from "@/lib/acesso";
import { asaasConfigurado, cancelarAssinatura, criarAssinatura, criarCliente, linkPagamento } from "@/lib/conta/asaas";
import { processarEvento } from "@/lib/conta/pagamentos";
import { cpfValido, DIAS_TESTE, PLANOS, type PlanoId } from "@/lib/conta/regras";
import { consulta } from "@/lib/db";

const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

async function exigirConta(volta: string) {
  const a = await acesso();
  if (!a.usuario) redirect(`/entrar?volta=${encodeURIComponent(volta)}`);
  if (!a.usuario.telefone_validado_em) redirect(`/cadastro/celular?volta=${encodeURIComponent(volta)}`);
  return a as typeof a & { usuario: NonNullable<typeof a.usuario> };
}

/** 7 dias grátis, sem cartão. Uma vez por conta e por celular. */
export async function comecarTeste() {
  const { usuario, assinatura } = await exigirConta("/assinar");
  if (assinatura) redirect("/assinar?erro=teste_usado");
  try {
    await consulta(
      `insert into assinatura (usuario_id, status, teste_inicio, teste_ate, teste_telefone)
       values ($1, 'teste', now(), now() + interval '${DIAS_TESTE} days', $2)`,
      [usuario.id, usuario.telefone],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") redirect("/assinar?erro=teste_usado");
    throw e;
  }
  redirect("/?bemvindo=1");
}

export type EstadoPagar = { erro?: string };

export async function iniciarPagamento(_: EstadoPagar, fd: FormData): Promise<EstadoPagar> {
  const planoId = String(fd.get("plano")) as PlanoId;
  const plano = PLANOS[planoId];
  if (!plano) return { erro: "Escolha um plano." };
  const { usuario, assinatura: a } = await exigirConta(`/assinar/pagar?plano=${planoId}`);
  const nome = String(fd.get("nome") ?? "").trim();
  const cpf = String(fd.get("cpf") ?? "");
  if (nome.split(/\s+/).length < 2) return { erro: "Escreva seu nome completo, como no CPF." };
  if (!cpfValido(cpf)) return { erro: "Confira o CPF." };

  if (a?.asaas_assinatura_id && ["ativa", "atrasada", "aguardando_pagamento"].includes(a.status)) {
    if (a.status === "ativa") return { erro: "Você já tem uma assinatura ativa. Para trocar de plano, cancele a atual em Minha conta." };
    // já existe cobrança em aberto: leva de volta para ela
    const link = asaasConfigurado() ? await linkPagamento(a.asaas_assinatura_id) : null;
    redirect(link ?? `/assinar/pagamento-teste`);
  }

  // não cobra antes de acabar o teste grátis ou o período já pago
  const inicio = new Date(Math.max(Date.now(), +(a?.teste_ate ? new Date(a.teste_ate) : 0), +(a?.pago_ate ? new Date(a.pago_ate) : 0)));
  const vencimento = diaSP(inicio);
  let clienteId = a?.asaas_cliente_id ?? null;
  let assinaturaId: string;

  if (asaasConfigurado()) {
    try {
      clienteId ??= await criarCliente({ nome, cpf, email: usuario.email, celular: usuario.telefone, usuarioId: usuario.id });
      assinaturaId = await criarAssinatura({
        cliente: clienteId,
        valor: plano.valor,
        ciclo: plano.cicloAsaas,
        primeiroVencimento: vencimento,
        descricao: `Farol do Leilão — plano ${plano.nome.toLowerCase()}`,
        usuarioId: usuario.id,
      });
    } catch (e) {
      return { erro: `O sistema de pagamento recusou: ${(e as Error).message}` };
    }
  } else if (modoTeste) {
    clienteId ??= `teste_cli_${usuario.id}`;
    assinaturaId = `teste_sub_${randomUUID()}`;
  } else {
    return { erro: "O pagamento ainda não foi configurado neste site." };
  }

  await consulta(
    `insert into assinatura (usuario_id, plano, status, asaas_cliente_id, asaas_assinatura_id)
     values ($1, $2, 'aguardando_pagamento', $3, $4)
     on conflict (usuario_id) do update set plano = excluded.plano, status = 'aguardando_pagamento',
       asaas_cliente_id = excluded.asaas_cliente_id, asaas_assinatura_id = excluded.asaas_assinatura_id,
       cancelada_em = null, atualizada_em = now()`,
    [usuario.id, plano.id, clienteId, assinaturaId],
  );

  if (!asaasConfigurado()) redirect("/assinar/pagamento-teste");
  const link = await linkPagamento(assinaturaId);
  redirect(link ?? "/conta");
}

/** Leva para a página de pagamento da cobrança em aberto. */
export async function pagarAgora() {
  const { assinatura: a } = await exigirConta("/conta");
  if (!a?.asaas_assinatura_id) redirect("/assinar");
  if (!asaasConfigurado()) redirect("/assinar/pagamento-teste");
  const link = await linkPagamento(a.asaas_assinatura_id);
  redirect(link ?? "/conta");
}

/** Só no modo teste: faz de conta que o Asaas confirmou o pagamento. */
export async function simularPagamento() {
  if (!modoTeste || asaasConfigurado()) redirect("/conta");
  const { assinatura: a } = await exigirConta("/conta");
  if (!a?.asaas_assinatura_id) redirect("/assinar");
  const venc = new Date(Math.max(Date.now(), +(a.teste_ate ? new Date(a.teste_ate) : 0), +(a.pago_ate ? new Date(a.pago_ate) : 0)));
  await processarEvento({
    id: `teste_evt_${randomUUID()}`,
    event: "PAYMENT_CONFIRMED",
    payment: { id: `teste_pay_${randomUUID()}`, subscription: a.asaas_assinatura_id, dueDate: diaSP(venc) },
  });
  redirect("/conta?pago=1");
}

export async function cancelar() {
  const { assinatura: a } = await exigirConta("/conta");
  if (!a?.asaas_assinatura_id || a.status === "cancelada") redirect("/conta");
  if (asaasConfigurado() && !a.asaas_assinatura_id.startsWith("teste_")) {
    await cancelarAssinatura(a.asaas_assinatura_id);
  }
  await consulta(
    "update assinatura set status = 'cancelada', cancelada_em = now(), atualizada_em = now() where usuario_id = $1",
    [a.usuario_id],
  );
  redirect("/conta?cancelada=1");
}
