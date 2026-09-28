"use client";

import { useActionState } from "react";
import { iniciarPagamento, type EstadoPagar } from "../acoes";

export default function FormPagar({ plano, nomeSugerido }: { plano: string; nomeSugerido: string }) {
  const [estado, agir, enviando] = useActionState<EstadoPagar, FormData>(iniciarPagamento, {});
  return (
    <form action={agir} className="form-pagar">
      <input type="hidden" name="plano" value={plano} />
      <label className="campo">
        <span>Nome completo (como no CPF)</span>
        <input name="nome" defaultValue={nomeSugerido} autoComplete="name" required />
      </label>
      <label className="campo">
        <span>CPF</span>
        <input name="cpf" inputMode="numeric" placeholder="000.000.000-00" required />
      </label>
      <p className="muted nota">
        O CPF vai direto para o Asaas, que emite a cobrança e a nota. O Farol não guarda o seu CPF.
      </p>
      {estado.erro && <p className="erro" role="alert">{estado.erro}</p>}
      <button className="botao grande" disabled={enviando}>{enviando ? "Preparando…" : "Ir para o pagamento"}</button>
    </form>
  );
}
