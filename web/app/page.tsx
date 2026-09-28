import Busca from "@/components/busca/Busca";
import { acesso } from "@/lib/acesso";
import { aplicarAcesso, lerFiltros } from "@/lib/busca/filtros";
import { opcoesFiltro, totais } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// Página inicial: a busca é o centro. Mapa livre para todos; filtros só para assinantes.
export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { assinante } = await acesso();
  const { filtros } = aplicarAcesso(lerFiltros(await searchParams), assinante);
  const [t, opcoes] = await Promise.all([totais(), assinante ? opcoesFiltro() : Promise.resolve(null)]);
  return (
    <main className="inicio">
      <Busca assinante={assinante} opcoes={opcoes} filtrosIniciais={filtros} totais={{ imoveis: t?.imoveis ?? 0, fontes: t?.fontes ?? 0 }} />
    </main>
  );
}
