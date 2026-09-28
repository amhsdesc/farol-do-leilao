# Catálogo de cobertura

O Farol do Leilão compete pela cobertura. O catálogo responde três perguntas, sempre com dados, nunca de memória:

1. **Quem vende imóveis em leilão?** (`catalogo/comitentes.csv`) — Caixa, BB, Santander, Itaú, Bradesco, BRB,
   Banrisul, Banestes, Emgea, Sicoob, Sicredi, Inter, BTG, BNB, BNDES, União (SPU) e outros. Para cada um: página
   oficial, se vende pelo próprio site, por leiloeiros ou pelos dois, e quais leiloeiros já vimos vendendo por ele.
2. **Quem leiloa?** (`catalogo/leiloeiros.csv`) — todos os leiloeiros oficiais, com a validação oficial e se
   trabalham com imóveis.
3. **Onde está a lista oficial?** (`catalogo/fontes_oficiais.csv`) — as 27 juntas comerciais, os tribunais que
   credenciam leiloeiros (CNJ Res. 236/2016) e a lista de sites falsos da FENALEI.

## Campos que importam em leiloeiros.csv

| Campo | Valores | Significado |
|---|---|---|
| `status_validacao` | validado · pendente · suspeito · inativo | validado = encontrado em lista oficial (junta/tribunal) |
| `validado_por` / `validado_em` | ex.: JUCIS-DF · 2026-09-28 | de onde e quando veio a validação |
| `faz_imoveis` | sim · nao · a_verificar | o site tem leilão de imóveis? |
| `plataforma` | ex.: soleon | software do site; se houver modelo em `fontes/plataformas/`, a fonte herda dele |
| `comitentes` | ids separados por `\|` | bancos/órgãos vistos vendendo por este leiloeiro |
| `fonte_id` | id do YAML | a fonte que coleta este leiloeiro |

Os leiloeiros de partida (34) vieram de pesquisa pública e estão como **pendente** até a lista oficial da junta
confirmar. Uma fonte só é criada automaticamente para `validado` + `faz_imoveis = sim`
(`criar-fontes --incluir-pendentes` abre exceção, usada para os grandes nacionais já conhecidos).

## Rotina de ampliação (repita por UF)

1. `python -m coletor catalogo oficiais` → abra a URL da junta da UF, baixe a relação (CSV, XLSX ou PDF).
   Para o DF, o Portal de Dados Abertos tem a "Relação de Leiloeiros Habilitados" em arquivo.
2. `python -m coletor catalogo importar arquivo --junta JUCESP --uf SP`
   - quem já estava no catálogo vira `validado`; quem não estava entra como `validado` + `a_verificar`.
3. Baixe a lista de sites falsos da FENALEI (um domínio por linha) e rode
   `python -m coletor catalogo sites-falsos falsos.txt --fonte FENALEI`. Domínio da lista nunca vira fonte.
4. `python -m coletor catalogo verificar --limite 200` → abre cada site: está no ar? tem imóveis? que plataforma?
5. `python -m coletor catalogo criar-fontes` → cria YAML (automático, ou herdando o modelo da plataforma).
6. `python -m coletor coletar --tipo automatico` e acompanhe em `/fontes` no site.
7. `python -m coletor catalogo` → confira a cobertura por UF.

## Plataformas

Muitos leiloeiros usam o mesmo software. A SOLEON (rodapé "Tecnologia SOLEON") diz atender mais de 100 leiloeiros,
com listagem de imóveis em `/lotes/imovel` e lote em `/item/<id>/detalhes`. Um modelo bem feito em
`fontes/plataformas/soleon.yaml` melhora de uma vez todos os leiloeiros que herdam dele. A cada plataforma nova
identificada pelo `verificar`, vale criar o modelo.

## O que não fazer

- Não usar agregadores concorrentes (Leilão Imóvel, BidMap, Zuk como agregador etc.) como fonte de dados. Eles
  podem servir para **descobrir nomes** de leiloeiros e bancos, que depois são validados na lista oficial.
- Não marcar `faz_imoveis = nao` à mão sem abrir o site: a verificação guarda a evidência.
