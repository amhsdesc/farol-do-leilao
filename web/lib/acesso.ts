import { cache } from "react";
import { auth, modoTeste } from "@/auth";
import { consulta } from "@/lib/db";
import { temAcesso, type Assinatura } from "@/lib/conta/regras";

export type Usuario = {
  id: number;
  name: string | null;
  email: string | null;
  image: string | null;
  telefone: string | null;
  telefone_validado_em: string | null;
};

export type AssinaturaLinha = Assinatura & {
  usuario_id: number;
  teste_telefone: string | null;
  asaas_cliente_id: string | null;
  asaas_assinatura_id: string | null;
  cancelada_em: string | null;
};

export type Acesso = {
  assinante: boolean;
  modoTeste: boolean;
  usuario: Usuario | null;
  assinatura: AssinaturaLinha | null;
};

// E-mails com acesso de assinante liberado sem pagar, pra testar o site (ex.: o seu). Configurar em
// FAROL_EMAILS_ADMIN, separados por vírgula. Não cria conta nem precisa de senha: a pessoa entra
// normalmente com o Google, e se o e-mail estiver nessa lista o acesso é liberado automaticamente.
const emailsAdmin = (process.env.FAROL_EMAILS_ADMIN ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Quem está vendo a página e se tem acesso de assinante. Uma consulta por requisição. */
export const acesso = cache(async (): Promise<Acesso> => {
  const s = await auth();
  const id = Number(s?.user?.id);
  if (!Number.isInteger(id) || id <= 0) return { assinante: false, modoTeste, usuario: null, assinatura: null };
  const [linha] = await consulta<{ u: Usuario; a: AssinaturaLinha | null }>(
    `select row_to_json(u.*) u, row_to_json(a.*) a
     from (select id, name, email, image, telefone, telefone_validado_em from users where id = $1) u
     left join assinatura a on a.usuario_id = u.id`,
    [id],
  );
  if (!linha) return { assinante: false, modoTeste, usuario: null, assinatura: null };

  if (linha.u.email && emailsAdmin.includes(linha.u.email.toLowerCase())) {
    const assinaturaAdmin: AssinaturaLinha = {
      usuario_id: linha.u.id,
      status: "ativa",
      plano: "anual",
      teste_ate: null,
      pago_ate: new Date(Date.now() + 10 * 365 * 86_400_000).toISOString(),
      teste_telefone: null,
      asaas_cliente_id: null,
      asaas_assinatura_id: null,
      cancelada_em: null,
    };
    return { assinante: true, modoTeste, usuario: linha.u, assinatura: assinaturaAdmin };
  }

  return { assinante: temAcesso(linha.a), modoTeste, usuario: linha.u, assinatura: linha.a };
});

/** Caminho interno seguro para voltar depois do login/cadastro. */
export function caminhoVolta(v: unknown, padrao = "/") {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : padrao;
}
