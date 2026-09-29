// Texto das notificações (e-mail e WhatsApp), separado do envio para ficar fácil de testar sem rede nem banco.

import { quando, reais, TIPOS } from "../formato.ts";

export type ImovelResumo = {
  tipo: string | null;
  cidade: string;
  uf: string;
  bairro: string | null;
  lanceMinimo: number | null;
  dataLeilao: string | Date | null;
};

export type TipoEventoAlerta = "preco" | "data" | "suspenso" | "indisponivel";
export type TipoLembrete = "lembrete_7d" | "lembrete_1d" | "lembrete_1h";

export type Mensagem = { assunto: string; texto: string };

export function tituloImovel(i: ImovelResumo): string {
  const t = TIPOS[i.tipo ?? ""] ?? "Imóvel";
  return `${t}${i.bairro ? ` em ${i.bairro}` : ""}, ${i.cidade}/${i.uf}`;
}

function link(siteUrl: string, imovelId: number): string {
  return `${siteUrl.replace(/\/$/, "")}/imovel/${imovelId}`;
}

/** Mensagem de mudança detectada pelo coletor (preço, data, suspensão ou indisponibilidade). */
export function mensagemEvento(
  tipo: TipoEventoAlerta,
  imovelId: number,
  i: ImovelResumo,
  valorAnterior: string | null,
  valorNovo: string | null,
  siteUrl: string,
): Mensagem {
  const titulo = tituloImovel(i);
  const url = link(siteUrl, imovelId);
  if (tipo === "preco") {
    const de = valorAnterior != null ? reais(Number(valorAnterior)) : "—";
    const para = valorNovo != null ? reais(Number(valorNovo)) : "—";
    const caiu = valorAnterior != null && valorNovo != null && Number(valorNovo) < Number(valorAnterior);
    return {
      assunto: `${caiu ? "Lance caiu" : "Lance mudou"}: ${titulo}`,
      texto: `O lance mínimo de ${titulo} ${caiu ? "caiu" : "mudou"} de ${de} para ${para}.\n\nVeja a ficha: ${url}`,
    };
  }
  if (tipo === "data") {
    const de = valorAnterior ? quando(valorAnterior) : "sem data";
    const para = valorNovo ? quando(valorNovo) : "sem data";
    return {
      assunto: `Data do leilão mudou: ${titulo}`,
      texto: `A data do leilão de ${titulo} mudou de ${de} para ${para}.\n\nVeja a ficha: ${url}`,
    };
  }
  if (tipo === "suspenso") {
    return {
      assunto: `Leilão suspenso: ${titulo}`,
      texto: `O leilão de ${titulo} foi suspenso. Acompanhe se ele volta: ${url}`,
    };
  }
  return {
    assunto: `Imóvel não está mais disponível: ${titulo}`,
    texto: `${titulo} saiu de todas as fontes que acompanhamos (arrematado, cancelado ou retirado do leilão).\n\nFicha: ${url}`,
  };
}

const ROTULO_LEMBRETE: Record<TipoLembrete, string> = {
  lembrete_7d: "em 7 dias",
  lembrete_1d: "amanhã",
  lembrete_1h: "daqui a pouco",
};

/** Imóvel novo que bateu com uma busca salva. */
export function mensagemNovoImovel(imovelId: number, i: ImovelResumo, rotuloBusca: string, siteUrl: string): Mensagem {
  const titulo = tituloImovel(i);
  const url = link(siteUrl, imovelId);
  return {
    assunto: `Novo imóvel em "${rotuloBusca}": ${titulo}`,
    texto:
      `Apareceu um imóvel novo que bate com a sua busca salva "${rotuloBusca}": ${titulo}, lance mínimo ${reais(i.lanceMinimo)}.` +
      `\n\nVeja a ficha: ${url}`,
  };
}

/** Lembrete antes do leilão (7 dias, 1 dia ou 1 hora antes). */
export function mensagemLembrete(tipo: TipoLembrete, imovelId: number, i: ImovelResumo, siteUrl: string): Mensagem {
  const titulo = tituloImovel(i);
  const url = link(siteUrl, imovelId);
  const quando_ = ROTULO_LEMBRETE[tipo];
  return {
    assunto: `Leilão ${quando_}: ${titulo}`,
    texto:
      `O leilão de ${titulo} é ${quando_} (${quando(i.dataLeilao)}), lance mínimo ${reais(i.lanceMinimo)}.` +
      `\n\nVeja a ficha e faça a conta antes de decidir: ${url}`,
  };
}
