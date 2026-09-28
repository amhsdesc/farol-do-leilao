# Como adicionar uma fonte

A meta é cobrir o máximo de leiloeiros sem que cada site novo vire um projeto. O caminho é sempre o mesmo:
**catálogo → inspeção → YAML → teste → coleta**.

## 1. Catálogo: saber quem existe

`coletor/fontes/catalogo_leiloeiros.csv` é a lista de todos os leiloeiros que queremos cobrir, com ou sem
fonte pronta. Ela responde "qual é a nossa cobertura?".

As juntas comerciais publicam a relação oficial de leiloeiros. Para o DF, o Portal de Dados Abertos tem o
conjunto **Relação de Leiloeiros Habilitados** (dados.df.gov.br). Baixe o CSV e importe:

```
python -m coletor catalogo --importar relacao.csv --uf DF --junta JUCIS-DF
```

Repita com JUCEG (GO) e com as juntas dos estados seguintes. Leiloeiros sem site próprio costumam publicar em
plataformas compartilhadas: vale anotar a plataforma na coluna `plataforma`.

Status possíveis: `a_mapear`, `mapeado`, `sem_imoveis` (só veículos/bens móveis), `bloqueado` (site proíbe
coleta ou exige login).

## 2. Inspeção: decidir o tipo de adaptador

```
python -m coletor inspecionar https://www.leiloeiro.com.br/imoveis
```

O comando abre a página num navegador, e mostra:

- **Plataforma** reconhecida (se houver). Se já existir modelo em `fontes/plataformas/`, a fonte nova é um
  YAML de 5 linhas com `herda:`.
- **Respostas JSON** que a página carregou, ordenadas pela cara de "lista de lotes". Se aparecer uma boa
  candidata, use `json_api`: é o tipo mais estável e barato.
- **Links de lote** encontrados, úteis para o `padrao_link_lote` do tipo automático.

As amostras ficam em `dados/inspecao/<domínio>/`.

## 3. Escolher o tipo

| Situação | Tipo | Esforço |
|---|---|---|
| A página carrega os lotes de uma API JSON | `json_api` | 15–30 min, muito estável |
| HTML com cards e página de detalhe estáveis | `seletores` | 30–60 min |
| Site pequeno, layout confuso, poucos lotes | `automatico` | 2 min; custo de IA por página nova |
| Várias fontes na mesma plataforma | modelo em `plataformas/` + `herda:` | 1 hora no 1º, 2 min nos demais |

Regra prática: comece todo site novo como `automatico` (`nova-fonte`) para ter cobertura no mesmo dia, e
migre para `json_api` ou `seletores` os que tiverem mais de ~50 lotes, porque aí o custo de IA começa a pesar.

## 4. Escrever o YAML

Modelos comentados em `fontes/leiloeiros/_exemplo_seletores.yaml` e `_exemplo_json_api.yaml`.
A sintaxe dos campos (`rotulo`, `texto_regex`, `css@attr`, `json`) está no topo de
`coletor/coletor/adaptadores/extracao.py`.

Dicas:
- `rotulo` resolve a maioria dos campos em sites de leiloeiro ("Avaliação:", "Endereço:").
- Deixe de fora o que o site não informa. Nunca preencha ocupação por padrão.
- `padroes: {uf: DF}` preenche a UF quando o site é de um estado só.

## 5. Testar

```
python -m coletor coletar id-da-fonte
python -m coletor fontes
```

Confira no site (`/fontes` e a busca) se os lotes apareceram com preço, praça e local. Para fontes com
volume relevante, salve uma página real em `coletor/tests/fixtures/` e escreva um teste como os de
`tests/test_adaptadores.py`: é o que avisa quando o site mudar de layout.

## Proteções que já existem

- Um lote só é marcado como removido se a coleta terminou sem erro e leu pelo menos 50% dos lotes ativos
  anteriores da fonte. Coletor quebrado não apaga a base.
- O mesmo imóvel em várias fontes vira uma ficha só (matrícula + cartório, número Caixa, ou endereço + área).
- Toda mudança de preço, praça ou status fica registrada em `leitura`.
