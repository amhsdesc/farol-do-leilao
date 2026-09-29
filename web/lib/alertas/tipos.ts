// Tipos e funções puras dos alertas — sem banco, para poder ser importado por componentes de cliente.
import { rotuloFiltros, type Filtros } from "@/lib/busca/filtros";

export type LinhaAlerta = {
  id: number;
  tipo: "imovel" | "busca";
  imovel_id: number | null;
  filtros: Filtros | null;
  nome: string | null;
  canal_email: boolean;
  canal_whatsapp: boolean;
  canal_telegram: boolean;
  ativo: boolean;
  criado_em: string;
  // só para tipo = imovel, quando o imóvel ainda existe
  imovel_tipo: string | null;
  imovel_uf: string | null;
  imovel_cidade: string | null;
  imovel_bairro: string | null;
  imovel_lance: number | null;
  imovel_data_leilao: string | null;
  imovel_foto: string | null;
};

/** Rótulo pronto pra tela: nome dado pela pessoa, ou calculado a partir dos filtros. */
export function rotuloAlerta(a: LinhaAlerta): string {
  if (a.nome) return a.nome;
  if (a.tipo === "busca" && a.filtros) return rotuloFiltros(a.filtros);
  return "Imóvel";
}
