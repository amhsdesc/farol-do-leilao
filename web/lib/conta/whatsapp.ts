// Envio de mensagens pela API oficial do WhatsApp (Meta Cloud API).
// Variáveis: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_MODELO_CODIGO (nome do modelo de autenticação
// aprovado na Meta, idioma pt_BR), WHATSAPP_MODELO_ALERTA (modelo de utilidade para avisos de alerta,
// também aprovado na Meta — mensagem de negócio fora da janela de 24h só sai por um modelo aprovado).
// Ver docs/configurar-contas.md.

const VERSAO = "v21.0";

export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function enviarMensagem(corpo: Record<string, unknown>): Promise<void> {
  const url = `https://graph.facebook.com/${VERSAO}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error("whatsapp: falha ao enviar mensagem", r.status, txt.slice(0, 500));
    throw new Error("Não conseguimos enviar a mensagem agora. Tente de novo em alguns minutos.");
  }
}

/** Manda um aviso de alerta (mudança de preço/data, suspensão, lembrete...) pelo modelo de utilidade aprovado. */
export async function enviarAlertaWhatsapp(telefoneE164: string, texto: string): Promise<void> {
  await enviarMensagem({
    messaging_product: "whatsapp",
    to: telefoneE164.replace("+", ""),
    type: "template",
    template: {
      name: process.env.WHATSAPP_MODELO_ALERTA ?? "alerta_leilao",
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: texto.slice(0, 1024) }] }],
    },
  });
}

/** Manda o código de validação usando o modelo de "autenticação" (botão copiar código). */
export async function enviarCodigoWhatsapp(telefoneE164: string, codigo: string): Promise<void> {
  await enviarMensagem({
    messaging_product: "whatsapp",
    to: telefoneE164.replace("+", ""),
    type: "template",
    template: {
      name: process.env.WHATSAPP_MODELO_CODIGO ?? "codigo_verificacao",
      language: { code: "pt_BR" },
      components: [
        { type: "body", parameters: [{ type: "text", text: codigo }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] },
      ],
    },
  });
}
