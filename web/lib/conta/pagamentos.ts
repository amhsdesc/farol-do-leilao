import { consulta, pool } from "@/lib/db";
import { novoPagoAte, PLANOS, type PlanoId } from "./regras";

export type EventoAsaas = {
  id?: string;
  event: string;
  payment?: { id: string; subscription?: string; dueDate?: string; value?: number; status?: string };
  subscription?: { id: string };
};

/**
 * Processa um aviso do Asaas (webhook) ou um pagamento simulado no modo teste.
 * Idempotente: o mesmo evento, ou o mesmo pagamento confirmado duas vezes (CONFIRMED e depois RECEIVED),
 * não estende o acesso duas vezes.
 */
export async function processarEvento(ev: EventoAsaas): Promise<string> {
  const assinaturaId = ev.payment?.subscription ?? ev.subscription?.id ?? null;
  const pagamentoId = ev.payment?.id ?? null;
  const cli = await pool.connect();
  try {
    await cli.query("begin");
    const ins = await cli.query(
      `insert into evento_pagamento (evento_id, tipo, asaas_assinatura_id, asaas_pagamento_id, corpo)
       values ($1, $2, $3, $4, $5) on conflict (evento_id) do nothing returning id`,
      [ev.id ?? null, ev.event, assinaturaId, pagamentoId, JSON.stringify(ev)],
    );
    if (!ins.rowCount) {
      await cli.query("rollback");
      return "repetido";
    }
    const eventoLinha = ins.rows[0].id;
    if (!assinaturaId) {
      await cli.query("commit");
      return "sem assinatura";
    }
    const { rows } = await cli.query(
      "select usuario_id, plano, status, pago_ate from assinatura where asaas_assinatura_id = $1 for update",
      [assinaturaId],
    );
    const a = rows[0];
    if (!a) {
      await cli.query("commit");
      return "assinatura desconhecida";
    }

    let resultado = "ignorado";
    if (ev.event === "PAYMENT_CONFIRMED" || ev.event === "PAYMENT_RECEIVED") {
      const ja = await cli.query(
        `select 1 from evento_pagamento where asaas_pagamento_id = $1 and id <> $2
           and tipo in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')`,
        [pagamentoId, eventoLinha],
      );
      if (!ja.rowCount) {
        const plano = PLANOS[a.plano as PlanoId];
        const venc = ev.payment?.dueDate ? new Date(`${ev.payment.dueDate}T00:00:00-03:00`) : new Date();
        const ate = novoPagoAte(plano, a.pago_ate ? new Date(a.pago_ate) : null, venc);
        await cli.query(
          `update assinatura set pago_ate = $2, status = case when status = 'cancelada' then status else 'ativa' end,
             atualizada_em = now() where usuario_id = $1`,
          [a.usuario_id, ate],
        );
        resultado = `pago até ${ate.toISOString().slice(0, 10)}`;
      } else resultado = "pagamento já contado";
    } else if (ev.event === "PAYMENT_OVERDUE") {
      await cli.query("update assinatura set status = 'atrasada', atualizada_em = now() where usuario_id = $1 and status <> 'cancelada'", [a.usuario_id]);
      resultado = "atrasada";
    } else if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_DELETED"].includes(ev.event)) {
      // estorno: o acesso pago daquela cobrança sai
      if (ev.event !== "PAYMENT_DELETED") {
        await cli.query("update assinatura set pago_ate = least(pago_ate, now()), atualizada_em = now() where usuario_id = $1", [a.usuario_id]);
        resultado = "estornado";
      }
    } else if (["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"].includes(ev.event)) {
      await cli.query(
        "update assinatura set status = 'cancelada', cancelada_em = coalesce(cancelada_em, now()), atualizada_em = now() where usuario_id = $1",
        [a.usuario_id],
      );
      resultado = "cancelada";
    }
    await cli.query("commit");
    return resultado;
  } catch (e) {
    await cli.query("rollback");
    throw e;
  } finally {
    cli.release();
  }
}

export async function eventosDaAssinatura(asaasAssinaturaId: string) {
  return consulta<{ tipo: string; recebido_em: string; corpo: EventoAsaas }>(
    "select tipo, recebido_em, corpo from evento_pagamento where asaas_assinatura_id = $1 order by recebido_em desc limit 20",
    [asaasAssinaturaId],
  );
}
