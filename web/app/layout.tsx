import type { Metadata } from "next";
import Link from "next/link";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Farol do Leilão — imóveis em leilão sem susto", template: "%s · Farol do Leilão" },
  description: "Imóveis em leilão da Caixa, bancos e leiloeiros oficiais numa busca só, com histórico de preço e praça.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="topo-in">
            <Link href="/" className="marca">
              <i aria-hidden="true" />
              Farol do Leilão
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
