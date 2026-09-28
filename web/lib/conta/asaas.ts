// Cliente mínimo da API do Asaas (cobrança recorrente).
// Variáveis: ASAAS_API_KEY, ASAAS_AMBIENTE (sandbox | producao), ASAAS_WEBHOOK_TOKEN. Ver docs/configurar-contas.md.
// O Farol nunca vê número de cartão: a pessoa paga na página do próprio Asaas (Pix, boleto ou cartão).

export function asaasConfigurado() {
  return Boolean(process.env.ASAAS_API_KEY);
}

function base() {
  if (process.env.ASAAS_URL) return process.env.ASAAS_URL;
  return process.env.ASAAS_AMBIENTE === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(base() + caminho, {
    method: metodo,
    headers: {
      access_token: process.env.ASAAS_API_KEY ?? "",
      "Content-Type": "application/json",
      "User-Agent": "farol-do-leilao",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const txt = await r.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const msg = json?.errors?.[0]?.description ?? `erro ${r.status}`;
    console.error("asaas:", metodo, caminho, r.status, txt.slice(0, 500));
    throw new Error(msg);
  }
  return json as T;
}

export async function criarCliente(d: { nome: string; cpf: string; email: string | null; celular: string | null; usuarioId: number }) {
  const r = await chamar<{ id: string }>("POST", "/customers", {
    name: d.nome,
    cpfCnpj: d.cpf.replace(/\D/g, ""),
    email: d.email ?? undefined,
    mobilePhone: d.celular?.replace(/^\+55/, "") ?? undefined,
    externalReference: String(d.usuarioId),
    notificationDisabled: false,
  });
  return r.id;
}

export async function criarAssinatura(d: {
  cliente: string; valor: number; ciclo: string; primeiroVencimento: string; descricao: string; usuarioId: number;
}) {
  const r = await chamar<{ id: string }>("POST", "/subscriptions", {
    customer: d.cliente,
    billingType: "UNDEFINED", // a pessoa escolhe Pix, boleto ou cartão na página do Asaas
    value: d.valor,
    nextDueDate: d.primeiroVencimento,
    cycle: d.ciclo,
    description: d.descricao,
    externalReference: String(d.usuarioId),
  });
  return r.id;
}

/** Link da página de pagamento da próxima cobrança em aberto. */
export async function linkPagamento(assinaturaId: string): Promise<string | null> {
  const r = await chamar<{ data: { invoiceUrl: string; status: string }[] }>("GET", `/subscriptions/${assinaturaId}/payments`);
  const aberta = r.data.find((p) => ["PENDING", "OVERDUE"].includes(p.status)) ?? r.data[0];
  return aberta?.invoiceUrl ?? null;
}

export async function cancelarAssinatura(assinaturaId: string) {
  await chamar("DELETE", `/subscriptions/${assinaturaId}`);
}
