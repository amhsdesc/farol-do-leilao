import Busca from "@/components/busca/Busca";
import { acesso } from "@/lib/acesso";
import { aplicarAcesso, lerFiltros } from "@/lib/busca/filtros";
import { opcoesFiltro, totais } from "@/lib/consultas";

export const dynamic = "force-dynamic";

// Página inicial: a busca é o centro. Mapa livre para todos; filtros só para assinantes.
export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { assinante } = await acesso();
  const sp = await searchParams;
  const { filtros } = aplicarAcesso(lerFiltros(sp), assinante);
  const [t, opcoes] = await Promise.all([totais(), assinante ? opcoesFiltro() : Promise.resolve(null)]);
  return (
    <main className="inicio">
      {sp.bemvindo && assinante && (
        <p className="aviso bom boas-vindas">
          Seus 7 dias grátis começaram. Os filtros, a calculadora e o link para os leiloeiros já estão liberados.
        </p>
      )}
      <Busca assinante={assinante} opcoes={opcoes} filtrosIniciais={filtros} totais={{ imoveis: t?.imoveis ?? 0, fontes: t?.fontes ?? 0 }} />
    </main>
  );
}
