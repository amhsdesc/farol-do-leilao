# Farol do Leilão — agregador de leilões de imóveis

Leia este arquivo inteiro antes de mexer no código. Ele é o contexto do projeto para o Claude Code.

## O que é

Agregador que reúne imóveis em leilão do **máximo possível de fontes, no Brasil inteiro**: Caixa (27 UFs),
todos os bancos e órgãos que vendem imóveis (BB, Santander, Itaú, Bradesco, BRB, Emgea, União...), e todos os
leiloeiros oficiais validados que fazem leilão de imóveis. Ficha única por imóvel, histórico de preço e praça, e —
na próxima fase — valor de mercado estimado por comparáveis. Objetivo: ser um agregador melhor que os existentes
(BidMap, BidHero, Spot, Radar Leilão...), a começar pela cobertura.

Público inicial: investidor pessoa física.

## Marca

Nome, voz, cores e tipografia em `docs/marca.md`. Público: quem nunca arrematou. Promessa: "Encontre. Faça a conta. Decida."
Todo texto do site segue a voz de lá: curto, sem juridiquês, termo explicado na hora, nunca promete lucro.

## Produto: o que é livre e o que é de assinante

Ver `docs/produto.md`. Resumo: mapa e ficha são livres; filtros, ordenação, calculadora, alertas e buscas salvas são
de assinante. **A trava vale no servidor** (`web/lib/acesso.ts` + `aplicarAcesso` em `web/lib/busca/filtros.ts`):
toda rota de API aplica `aplicarAcesso` antes de consultar. Nunca confie só na tela.
Link para o site do leiloeiro ou edital: sempre `/ir/<lote>` (confere a assinatura e redireciona); nunca pôr `lote.url`
ou `edital_url` no HTML ou em resposta de API.

## Estrutura

```
db/migrations/     SQL do banco (PostgreSQL 16 + PostGIS). Aplicar em ordem.
coletor/           Python 3.11+. Motor de coleta, normalização, deduplicação, geocodificação.
  coletor/adaptadores/   Um arquivo por TIPO de adaptador (não por site).
  fontes/                Um YAML por fonte (site). Adicionar fonte = adicionar YAML.
  fontes/plataformas/    Modelos YAML compartilhados por leiloeiros que usam o mesmo software (ex.: soleon.yaml).
  fontes/bancos/         Sites próprios de bancos e órgãos (Santander Imóveis, Seu Imóvel BB, Itaú, União...).
  catalogo/              Mapa de cobertura: leiloeiros.csv, comitentes.csv, fontes_oficiais.csv, sites_falsos.csv.
  tests/                 pytest. Fixtures em tests/fixtures.
web/               Next.js (App Router, TypeScript). Lê o banco direto com `pg`.
docs/              Guias: como adicionar fonte, arquitetura.
```

## Regras que não se quebram

1. **Nunca apagar nem sobrescrever histórico.** Toda mudança de um lote gera uma linha nova em `leitura`.
   O histórico é o ativo mais valioso do projeto (vira a base de "por quanto foi arrematado").
2. **Uma fonte nova não pode exigir mudança no núcleo.** Se exigir, o núcleo está errado: generalize o adaptador.
3. **Ocupação só é afirmada quando a fonte afirma.** Sem informação = `nao_informado`, nunca `desocupado`.
4. **Coleta educada:** respeitar robots.txt, intervalo mínimo por domínio (padrão 2 s), user-agent identificado.
5. **Sem dados pessoais:** não guardar nome/CPF de executados nem contatos de anunciantes. Só o imóvel.
6. **Proteção contra coletor quebrado:** um lote só vira `removido` se a execução terminou `ok` e leu
   pelo menos 50% dos lotes ativos anteriores daquela fonte.
7. **Só fontes primárias:** leiloeiro oficial validado (junta comercial/tribunal), banco/órgão vendedor, ou
   plataforma que publica leilões de leiloeiros oficiais. Agregadores concorrentes nunca são fonte.
8. **Comitente ≠ fonte:** o comitente é quem vende (Caixa, Santander...); a fonte é onde coletamos. Um banco vende
   por vários leiloeiros. Todo lote deve ter `comitente` quando a página disser.
9. Valores em reais são `numeric`, nunca float. Datas com fuso (`timestamptz`, America/Sao_Paulo na origem).

## Tipos de adaptador (do mais barato ao mais caro de manter)

| Tipo | Quando usar | Arquivo |
|---|---|---|
| `csv_caixa` | Lista oficial da Caixa por UF | `adaptadores/caixa_csv.py` |
| `json_api` | Site carrega os lotes por uma API JSON (ver com `python -m coletor inspecionar`) | `adaptadores/json_api.py` |
| `seletores` | HTML estável; campos por seletor CSS/regex no YAML | `adaptadores/seletores.py` |
| `automatico` | Cauda longa: qualquer site, extração por LLM (Claude Haiku), com cache por hash | `adaptadores/automatico.py` |

Prioridade ao adicionar um site: `json_api` > `seletores` > `automatico`.
Se vários leiloeiros usam a mesma plataforma, crie o modelo em `fontes/plataformas/` e use `herda:` no YAML.

## Modelo de dados (resumo)

- `fonte` — cada site/fonte, espelha o YAML (com `comitente` quando a fonte é de um vendedor só).
- `imovel` — ficha única (deduplicada) com endereço, áreas, ponto geográfico.
- `imovel_chave` — chaves de deduplicação (matrícula+cartório, endereço normalizado+área, id Caixa).
- `lote` — cada anúncio de cada fonte (`unique(fonte_id, id_externo)`), estado atual, com `comitente`.
- `leitura` — snapshot a cada mudança de um lote. Nunca apagar.
- `execucao_coleta` — log de cada rodada por fonte.
- `vw_busca` — view que o site usa: um registro por imóvel com o melhor lote ativo.

## Comandos

```
cd coletor
python -m coletor fontes                 # lista fontes e status
python -m coletor coletar caixa-df       # coleta uma fonte
python -m coletor coletar --todas        # coleta todas as fontes ativas
python -m coletor inspecionar URL        # descobre APIs JSON, plataforma e salva amostras
python -m coletor nova-fonte URL         # cria YAML inicial a partir de um site
python -m coletor geocodificar           # põe no mapa os imóveis sem coordenada
python -m coletor catalogo               # cobertura: leiloeiros validados, que fazem imóveis, com fonte
python -m coletor catalogo importar ARQ --junta JUCIS-DF --uf DF   # lista oficial (CSV/XLSX/PDF)
python -m coletor catalogo verificar     # site no ar? faz imóveis? qual plataforma?
python -m coletor catalogo criar-fontes  # YAML para quem faz imóveis e ainda não tem fonte
pytest                                   # testes
```

## Convenções

- Código e nomes em português (tabelas, campos, funções de domínio). Termos técnicos podem ficar em inglês.
- Cada adaptador devolve `LoteBruto` (ver `coletor/modelos.py`); normalização fica em `normalizar.py`.
- Todo adaptador novo precisa de teste com fixture salva (HTML/JSON/CSV real anonimizado).
