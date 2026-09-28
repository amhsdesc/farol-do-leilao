"use server";

import { redirect } from "next/navigation";
import { acesso, caminhoVolta } from "@/lib/acesso";
import { confirmarCodigo, pedirCodigo } from "@/lib/conta/celular";

export type EstadoCelular = {
  etapa: "numero" | "codigo";
  telefone?: string;
  erro?: string;
  codigoTeste?: string;
};

export async function acaoCelular(estado: EstadoCelular, fd: FormData): Promise<EstadoCelular> {
  const { usuario } = await acesso();
  if (!usuario) redirect("/entrar");
  const volta = caminhoVolta(fd.get("volta"), "/assinar");

  if (fd.get("acao") === "trocar") return { etapa: "numero" };

  if (fd.get("acao") === "enviar" || fd.get("acao") === "reenviar") {
    const texto = fd.get("acao") === "reenviar" ? (estado.telefone ?? "") : String(fd.get("telefone") ?? "");
    const r = await pedirCodigo(usuario.id, texto);
    if (!r.ok) return { ...estado, erro: r.erro };
    return { etapa: "codigo", telefone: r.telefone, codigoTeste: r.codigoTeste };
  }

  if (fd.get("acao") === "confirmar" && estado.telefone) {
    const r = await confirmarCodigo(usuario.id, estado.telefone, String(fd.get("codigo") ?? ""));
    if (!r.ok) return { ...estado, erro: r.erro };
    redirect(volta);
  }
  return estado;
}
