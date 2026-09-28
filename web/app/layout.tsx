import type { Metadata } from "next";
import Link from "next/link";
import { Simbolo } from "@/components/Logo";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Farol do Leilão — Encontre. Faça a conta. Decida.", template: "%s · Farol do Leilão" },
  description: "Leilão de imóveis sem susto, para quem está começando: Caixa, bancos e leiloeiros oficiais numa busca só, com a conta feita antes do lance.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="topo-in">
            <Link href="/" className="marca" aria-label="Farol do Leilão, página inicial">
              <Simbolo tamanho={34} />
              farol <span>do leilão</span>
            </Link>
            <nav>
              <Link href="/">Buscar imóveis</Link>
              <Link href="/fontes">Fontes</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
