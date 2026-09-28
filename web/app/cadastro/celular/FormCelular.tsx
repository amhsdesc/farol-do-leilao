"use client";

import { useActionState } from "react";
import { celularLegivel } from "@/lib/conta/regras";
import { acaoCelular, type EstadoCelular } from "./acoes";

export default function FormCelular({ volta }: { volta: string }) {
  const [estado, agir, enviando] = useActionState<EstadoCelular, FormData>(acaoCelular, { etapa: "numero" });

  return (
    <form action={agir} className="form-celular">
      <input type="hidden" name="volta" value={volta} />
      {estado.etapa === "numero" ? (
        <>
          <label className="campo">
            <span>Seu celular com WhatsApp</span>
            <input name="telefone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(61) 99999-8888" required />
          </label>
          <button className="botao" name="acao" value="enviar" disabled={enviando}>
            {enviando ? "Enviando…" : "Receber código no WhatsApp"}
          </button>
        </>
      ) : (
        <>
          <p className="texto">
            Mandamos um código de 6 números para o WhatsApp <b className="num">{celularLegivel(estado.telefone!)}</b>.
          </p>
          {estado.codigoTeste && (
            <p className="aviso">Modo teste: o WhatsApp não está configurado. O código é <b className="num">{estado.codigoTeste}</b>.</p>
          )}
          <label className="campo">
            <span>Código</span>
            <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="000000" required className="campo-codigo" />
          </label>
          <button className="botao" name="acao" value="confirmar" disabled={enviando}>
            {enviando ? "Conferindo…" : "Confirmar"}
          </button>
          <div className="acoes-secundarias">
            <button className="link" name="acao" value="reenviar" formNoValidate disabled={enviando}>Mandar outro código</button>
            <button className="link" name="acao" value="trocar" formNoValidate disabled={enviando}>Trocar número</button>
          </div>
        </>
      )}
      {estado.erro && <p className="erro" role="alert">{estado.erro}</p>}
    </form>
  );
}
