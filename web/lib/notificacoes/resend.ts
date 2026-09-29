// Envio de e-mail pela Resend (plano grátis cobre bem o começo). Ver docs/configurar-contas.md.
// Variáveis: RESEND_API_KEY, RESEND_REMETENTE (precisa de domínio verificado na Resend).

export function resendConfigurado() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarEmail(destino: string, assunto: string, texto: string): Promise<void> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_REMETENTE ?? "Farol do Leilão <avisos@faroldoleilao.com.br>",
      to: destino,
      subject: assunto,
      text: texto,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error("resend: falha ao enviar e-mail", r.status, txt.slice(0, 500));
    throw new Error(`Resend respondeu ${r.status}`);
  }
}
