// Regras de conta e assinatura. Código puro (sem banco), testado em regras.test.ts.

export type PlanoId = "mensal" | "trimestral" | "anual";

export type Plano = {
  id: PlanoId;
  nome: string;
  valor: number;       // cobrado a cada ciclo, em reais
  meses: number;       // duração do ciclo
  cicloAsaas: "MONTHLY" | "QUARTERLY" | "YEARLY";
};

// Preços decididos pelo Desc em set/2026.
export const PLANOS: Record<PlanoId, Plano> = {
  mensal: { id: "mensal", nome: "Mensal", valor: 44.9, meses: 1, cicloAsaas: "MONTHLY" },
  trimestral: { id: "trimestral", nome: "Trimestral", valor: 109.9, meses: 3, cicloAsaas: "QUARTERLY" },
  anual: { id: "anual", nome: "Anual", valor: 399.9, meses: 12, cicloAsaas: "YEARLY" },
};

// Quantos alertas (imóvel + busca salva, somados) cada plano pode ter ativos ao mesmo tempo.
// null = sem limite. Durante o teste grátis (sem plano escolhido ainda) vale o limite do mensal.
export const LIMITE_ALERTAS: Record<PlanoId, number | null> = {
  mensal: 2,
  trimestral: 5,
  anual: null,
};

/** Quantos alertas a pessoa pode ter ativos ao mesmo tempo, dado o plano (ou null = sem assinatura/teste). */
export function limiteAlertas(planoId: string | null): number | null {
  if (planoId && planoId in LIMITE_ALERTAS) return LIMITE_ALERTAS[planoId as PlanoId];
  return LIMITE_ALERTAS.mensal;
}

export const DIAS_TESTE = 7;
/** Dias de tolerância depois do vencimento antes de travar (boleto/Pix que demora a compensar). */
export const DIAS_TOLERANCIA = 3;

export function porMes(p: Plano) {
  return Math.round((p.valor / p.meses) * 100 + 1e-6) / 100;
}

/** Economia em relação a pagar o mensal pelo mesmo período (0 a 1). */
export function economia(p: Plano) {
  const cheio = PLANOS.mensal.valor * p.meses;
  return Math.max(0, 1 - p.valor / cheio);
}

export type Assinatura = {
  status: string;
  plano: string | null;
  teste_ate: Date | string | null;
  pago_ate: Date | string | null;
};

const data = (v: Date | string | null) => (v == null ? null : new Date(v));

/** A pessoa tem acesso de assinante agora? */
export function temAcesso(a: Assinatura | null | undefined, agora = new Date()): boolean {
  if (!a) return false;
  const teste = data(a.teste_ate);
  if (teste && teste > agora) return true;
  const pago = data(a.pago_ate);
  if (pago && +pago + DIAS_TOLERANCIA * 86_400_000 > +agora) return true;
  return false;
}

export type Situacao =
  | { tipo: "sem_conta" }
  | { tipo: "sem_celular" }
  | { tipo: "pode_testar" }
  | { tipo: "em_teste"; ate: Date; plano: string | null }
  | { tipo: "ativa"; ate: Date; plano: string; cancelada: boolean }
  | { tipo: "aguardando_pagamento"; plano: string | null }
  | { tipo: "vencida" };

/** O que mostrar na página de planos e em Minha conta. */
export function situacao(
  usuario: { telefone_validado_em: Date | string | null } | null,
  a: (Assinatura & { cancelada_em?: Date | string | null }) | null,
  agora = new Date(),
): Situacao {
  if (!usuario) return { tipo: "sem_conta" };
  if (!usuario.telefone_validado_em) return { tipo: "sem_celular" };
  if (!a) return { tipo: "pode_testar" };
  const teste = data(a.teste_ate);
  const pago = data(a.pago_ate);
  if (pago && temAcesso({ ...a, teste_ate: null }, agora) && (!teste || pago >= teste)) {
    return { tipo: "ativa", ate: pago, plano: a.plano ?? "", cancelada: a.status === "cancelada" };
  }
  if (teste && teste > agora) return { tipo: "em_teste", ate: teste, plano: a.plano };
  if (a.status === "aguardando_pagamento") return { tipo: "aguardando_pagamento", plano: a.plano };
  return { tipo: "vencida" };
}

/** Até quando fica pago depois de um pagamento confirmado. Soma o ciclo a partir do maior entre hoje e o fim atual. */
export function novoPagoAte(plano: Plano, pagoAteAtual: Date | null, vencimento: Date, agora = new Date()): Date {
  const base = new Date(Math.max(+vencimento, +(pagoAteAtual ?? 0), +agora));
  const r = new Date(base);
  r.setMonth(r.getMonth() + plano.meses);
  return r;
}

/** Celular brasileiro → E.164 (+55DDNNNNNNNNN). Devolve null se não for celular válido. */
export function normalizarCelular(texto: string): string | null {
  let d = (texto ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 11) return null;          // DDD + 9 dígitos
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[2] !== "9") return null;
  return `+55${d}`;
}

export function celularLegivel(e164: string) {
  const d = e164.replace(/^\+55/, "");
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** CPF válido (dígitos verificadores). Usado só para mandar ao Asaas; não guardamos. */
export function cpfValido(texto: string): boolean {
  const d = (texto ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
