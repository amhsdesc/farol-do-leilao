import Link from "next/link";

// Página de algo que é só para assinantes, vista por quem ainda não assina.
export default function Travado({ titulo, texto, itens }: { titulo: string; texto: string; itens: string[] }) {
  return (
    <main className="pagina estreita">
      <div className="painel destaque-assinante">
        <span className="rotulo">Para assinantes</span>
        <h1>{titulo}</h1>
        <p>{texto}</p>
        <ul className="lista-check">
          {itens.map((i) => <li key={i}>{i}</li>)}
        </ul>
        <div>
          <Link className="botao" href="/assinar">Conhecer os planos</Link>
        </div>
      </div>
    </main>
  );
}
