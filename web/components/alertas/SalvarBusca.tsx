"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { criarAlertaBusca } from "@/app/alertas/acoes";
import type { Filtros } from "@/lib/busca/filtros";

/** Botão "Salvar esta busca" do painel de filtros: vira um alerta de imóveis novos compatíveis. */
export default function SalvarBusca({ filtros, nFiltros }: { filtros: Filtros; nFiltros: number }) {
  const [estado, setEstado] = useState<"pronto" | "salvo" | "erro">("pronto");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function salvar() {
    setErro("");
    iniciar(async () => {
      const r = await criarAlertaBusca(filtros);
      if (!r.ok) {
        setEstado("erro");
        setErro(r.erro);
        return;
      }
      setEstado("salvo");
    });
  }

  if (estado === "salvo") {
    return (
      <p className="nota salvo-busca">
        Busca salva ✓ Você recebe um aviso quando aparecer um imóvel novo assim. <Link href="/alertas">Ver meus alertas</Link>
      </p>
    );
  }
  return (
    <div className="salvar-busca">
      <button type="button" className="botao secundario" onClick={salvar} disabled={pendente || nFiltros === 0}>
        {pendente ? "Salvando…" : "Salvar esta busca"}
      </button>
      {nFiltros === 0 && <small className="muted">Escolha pelo menos um filtro para salvar.</small>}
      {estado === "erro" && <p className="nota ruim">{erro}</p>}
    </div>
  );
}
