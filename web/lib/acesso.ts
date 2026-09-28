import { cookies } from "next/headers";

// Quem é assinante. Até existir cadastro e pagamento (etapa 3 do roteiro), NINGUÉM é assinante
// no site publicado: os filtros ficam travados para todos.
//
// Para testar a visão de assinante no seu computador, ponha no web/.env.local:
//   FAROL_TESTE_ASSINANTE=permitir
// e use o botão "Ver como assinante" que aparece no rodapé. Nunca ligue isso no site publicado.

export const COOKIE_TESTE = "farol_teste_assinante";

export type Acesso = { assinante: boolean; modoTeste: boolean };

export function modoTesteLigado() {
  return process.env.FAROL_TESTE_ASSINANTE === "permitir";
}

export async function acesso(): Promise<Acesso> {
  const modoTeste = modoTesteLigado();
  if (!modoTeste) return { assinante: false, modoTeste };
  const assinante = (await cookies()).get(COOKIE_TESTE)?.value === "1";
  return { assinante, modoTeste };
}
