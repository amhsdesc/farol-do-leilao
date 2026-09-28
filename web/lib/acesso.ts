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
  return { assinante: temAcesso(linha.a), modoTeste, usuario: linha.u, assinatura: linha.a };
});

/** Caminho interno seguro para voltar depois do login/cadastro. */
export function caminhoVolta(v: unknown, padrao = "/") {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : padrao;
}
