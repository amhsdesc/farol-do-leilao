const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export const reais = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));
export const porcento = (v: number | null | undefined) => (v == null ? "—" : pct.format(v));
export const quando = (v: string | Date | null | undefined) => (v ? dataHora.format(new Date(v)) : "—");
export const diaMes = (v: string | Date | null | undefined) => (v ? data.format(new Date(v)) : "—");
export const area = (v: number | null | undefined) =>
  v == null ? null : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²`;

export const TIPOS: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  terreno: "Terreno",
  rural: "Rural",
  comercial: "Comercial",
  galpao: "Galpão",
  vaga: "Vaga de garagem",
  outros: "Outros",
};

export const MODALIDADES: Record<string, string> = {
  judicial: "Judicial",
  extrajudicial: "Extrajudicial",
  venda_direta: "Venda direta",
  licitacao: "Licitação",
  outros: "Outros",
};

export const OCUPACAO: Record<string, { rotulo: string; classe: string }> = {
  ocupado: { rotulo: "Ocupado", classe: "chip-ruim" },
  desocupado: { rotulo: "Desocupado", classe: "chip-bom" },
  nao_informado: { rotulo: "Ocupação não informada", classe: "chip-aviso" },
};

export function proximaPraca(i: { praca_atual: number | null; data_praca1: string | null; data_praca2: string | null }) {
  const d = i.praca_atual === 2 ? i.data_praca2 : i.data_praca1 ?? i.data_praca2;
  if (!d) return i.praca_atual ? `${i.praca_atual}ª praça` : null;
  return `${i.praca_atual ?? 1}ª praça ${diaMes(d)}`;
}
