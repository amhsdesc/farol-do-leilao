import type { Metadata } from "next";
import { painelFontes } from "@/lib/consultas";
import { quando } from "@/lib/formato";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fontes" };

const TIPO: Record<string, string> = {
  csv_caixa: "Lista Caixa",
  json_api: "API JSON",
  seletores: "Seletores",
  automatico: "Automático (IA)",
};

export default async function Fontes() {
  const fontes = await painelFontes();
  const ativas = fontes.filter((f) => f.ativa);
  const comProblema = ativas.filter((f) => f.status === "erro" || f.status === "parcial").length;
  const lotes = ativas.reduce((s, f) => s + f.ativos, 0);

  return (
    <main className="pagina">
      <h1 style={{ fontSize: 26 }}>Fontes coletadas</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {ativas.length} fontes ativas · {lotes.toLocaleString("pt-BR")} lotes ativos ·{" "}
        {comProblema ? <span className="ruim">{comProblema} com problema na última coleta</span> : "nenhuma com problema"}
      </p>
      <section className="painel tabela" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Tipo</th>
              <th>UF</th>
              <th>Lotes ativos</th>
              <th>Última coleta</th>
              <th>Mudanças</th>
              <th>Falhas 7 dias</th>
              <th>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id} style={f.ativa ? undefined : { opacity: 0.5 }}>
                <td>
                  <strong>{f.nome}</strong>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {f.site ? (
                      <a href={f.site} target="_blank" rel="noopener noreferrer">
                        {f.id}
                      </a>
                    ) : (
                      f.id
                    )}
                  </div>
                </td>
                <td>{TIPO[f.tipo_adaptador] ?? f.tipo_adaptador}</td>
                <td>{f.uf?.join(", ")}</td>
                <td className="num">{f.ativos.toLocaleString("pt-BR")}</td>
                <td>
                  <span className={`estado ${f.status ?? "nunca"}`}>{f.status ?? "nunca"}</span>
                  <div className="muted num" style={{ fontSize: 12 }}>
                    {quando(f.iniciada_em)}
                  </div>
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {f.status ? `+${f.lotes_novos} · ~${f.lotes_alterados} · −${f.lotes_removidos}` : "—"}
                </td>
                <td className={`num ${f.falhas_7d ? "ruim" : ""}`}>
                  {f.falhas_7d}/{f.execucoes_7d}
                </td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 360 }}>
                  {f.mensagem ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
