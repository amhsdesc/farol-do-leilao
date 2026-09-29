"use client";

import { useState, useTransition } from "react";
import { atualizarAlerta, excluirAlerta } from "@/app/alertas/acoes";
import type { LinhaAlerta } from "@/lib/alertas/tipos";

/** Pausar/retomar, trocar canais e excluir — usado nas duas listas (imóvel e busca salva). */
export default function ControlesAlerta({ a, onExcluido }: { a: LinhaAlerta; onExcluido: () => void }) {
  const [ativo, setAtivo] = useState(a.ativo);
  const [email, setEmail] = useState(a.canal_email);
  const [whatsapp, setWhatsapp] = useState(a.canal_whatsapp);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function alternarAtivo() {
    setErro("");
    iniciar(async () => {
      const r = await atualizarAlerta(a.id, { ativo: !ativo });
      if (!r.ok) return setErro(r.erro);
      setAtivo(r.ativo);
    });
  }

  function mudarCanal(campo: "canal_email" | "canal_whatsapp", valor: boolean) {
    if (campo === "canal_email") setEmail(valor);
    else setWhatsapp(valor);
    iniciar(async () => {
      const r = await atualizarAlerta(a.id, { [campo]: valor });
      if (!r.ok) setErro(r.erro);
    });
  }

  function excluir() {
    if (!window.confirm("Excluir este alerta? Você não recebe mais avisos dele.")) return;
    iniciar(async () => {
      const r = await excluirAlerta(a.id);
      if (!r.ok) return setErro(r.erro);
      onExcluido();
    });
  }

  return (
    <div className="controles-alerta">
      <label className="marcar pequeno">
        <input type="checkbox" checked={email} disabled={pendente} onChange={(e) => mudarCanal("canal_email", e.target.checked)} />
        <span>E-mail</span>
      </label>
      <label className="marcar pequeno">
        <input type="checkbox" checked={whatsapp} disabled={pendente} onChange={(e) => mudarCanal("canal_whatsapp", e.target.checked)} />
        <span>WhatsApp</span>
      </label>
      <button type="button" className="link" onClick={alternarAtivo} disabled={pendente}>
        {ativo ? "Pausar" : "Retomar"}
      </button>
      <button type="button" className="link ruim" onClick={excluir} disabled={pendente}>
        Excluir
      </button>
      {erro && <span className="nota ruim">{erro}</span>}
    </div>
  );
}
