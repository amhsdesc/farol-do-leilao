# Marca — Farol do Leilão

Aprovada em 28/09/2026: visual e voz "Luz amiga" (direção C) com a frase da direção B.
Quadro de referência: artefato "Farol do Leilão — identidade visual", prancha "Marca final".

## Público
Quem nunca arrematou ou está começando. Tudo no site parte de: "essa pessoa entende isso sem ajuda?"

## Mensagens
| Uso | Texto |
|---|---|
| Promessa (em todo lugar) | **Encontre. Faça a conta. Decida.** |
| Apoio (para quem é) | Leilão de imóveis sem susto, para quem está começando. |
| Boas-vindas | Nunca arrematou? A gente acende a luz. |

Os três passos organizam o produto: **1 Encontre** (busca), **2 Faça a conta** (calculadoras e valor de mercado),
**3 Decida** (lance máximo e riscos).

## Voz
- Fala como quem já arrematou: frases curtas, "você", sem juridiquês.
- Explica o termo na hora: "2ª praça (a segunda tentativa de venda, com preço menor)".
- Todo aviso traz o próximo passo: "Não sabemos se está ocupado. Visite antes do lance."
- Nunca promete lucro. Mostra a conta e deixa a decisão com a pessoa.
- Leve no texto, sério nos números: brincadeira nunca encosta em valor, prazo ou risco.

## Cores
| Nome | Hex | Uso |
|---|---|---|
| Anoitecer | #4B3BB0 | botões, links, marca (texto branco por cima: contraste 8:1) |
| Luz acesa | #FFC93C | destaque, brilho do farol, selos; **nunca como cor de texto** |
| Tinta | #1F1B2E | texto |
| Lavanda | #EFEDF4 | fundo das páginas |
| Pode ir | fundo #E2F4EA, texto #1E7550 | bom negócio, confirmação |
| Fica de olho | fundo #FFF4D6, texto #7A5600 | avisos |
| Risco | fundo #FBE3E1, texto #A3302A | ocupado, problema jurídico |

Os tokens estão em `web/app/globals.css` (tema claro e escuro).

## Tipografia
- **Baloo 2** (600/800): só logotipo e títulos grandes.
- **Nunito Sans** (400–800): todo o resto, inclusive valores, sempre com algarismos alinhados (`tabular-nums`).

## Logotipo
- Símbolo: farol arredondado com halo amarelo (`web/components/Logo.tsx`).
- Escrita: "farol" (Baloo 800, Tinta) + "do leilão" (Baloo 600, Anoitecer), em minúsculas.
- Versões: fundo claro, fundo Anoitecer (torre branca, "do leilão" em Luz acesa) e ícone de app (fundo Luz acesa).

## Formas
Cantos generosos (cartões 22 px, botões e campos de busca em pílula). Sem sombras pesadas nem degradês.
