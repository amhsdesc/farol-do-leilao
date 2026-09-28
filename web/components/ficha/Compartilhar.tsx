"use client";

import { useState } from "react";

export default function Compartilhar({ titulo }: { titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="botao secundario"
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({ title: titulo, url });
            return;
          } catch {
            /* cancelado: cai para copiar */
          }
        }
        await navigator.clipboard?.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "Link copiado" : "Compartilhar"}
    </button>
  );
}
