# Farol do Leilão

Agregador nacional de imóveis em leilão: Caixa (27 UFs), bancos e órgãos vendedores, e leiloeiros oficiais
validados, numa busca só, com ficha única por imóvel, histórico de preço e praça e calculadora de arrematação.

- `coletor/` — motor de coleta em Python (4 tipos de adaptador, normalização, deduplicação, histórico)
- `web/` — site em Next.js (busca com mapa, ficha do imóvel, painel de fontes)
- `db/` — banco PostgreSQL + PostGIS
- `docs/` — como adicionar fontes e como o sistema funciona

## Instalação no Windows (uma vez)

Instale: [Git](https://git-scm.com/download/win), [Python 3.12](https://www.python.org/downloads/)
(marque "Add python.exe to PATH"), [Node.js 22 LTS](https://nodejs.org/) e
[Docker Desktop](https://www.docker.com/products/docker-desktop/).

No PowerShell, dentro da pasta `farol-do-leilao`:

```powershell
# 1. Configuração
copy .env.example .env          # depois abra o .env e preencha seu e-mail

# 2. Banco de dados
docker compose up -d

# 3. Coletor
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e "coletor[dev,navegador,listas]"
playwright install chromium
cd coletor
python -m coletor migrar
pytest                           # 35 testes devem passar (os de banco pedem TEST_DATABASE_URL)
cd ..

# 4. Site
cd web
npm install
npm run dev                      # abre em http://localhost:3000
```

## Primeira coleta real

```powershell
cd coletor
python -m coletor coletar caixa      # lista da Caixa, 27 UFs
python -m coletor geocodificar        # põe os imóveis no mapa (1 por segundo, é devagar na 1ª vez)
python -m coletor status
```

Se a Caixa recusar o download automático, abra o `fontes/caixa.yaml` e use `navegador: true` ou baixe os
CSV manualmente e aponte `arquivo_local`.

Quer ver o site antes de coletar? `python scripts/carregar_demo.py` carrega 9 imóveis fictícios;
`python scripts/carregar_demo.py --limpar` remove.
Para testar a busca com volume, `python scripts/carregar_demo_nacional.py` carrega ~800 imóveis fictícios nas 27 capitais
(`--limpar` remove).

Para testar cadastro e assinatura no seu computador antes de criar as contas no Google, na Meta e no Asaas,
ponha `FAROL_MODO_TESTE=permitir` e um `AUTH_SECRET` no arquivo `web/.env.local` (junto com o `DATABASE_URL`).
Aí o login aceita qualquer e-mail, o código do WhatsApp aparece na tela e o pagamento é simulado.
Nunca ligue isso no site publicado. Para ligar as contas de verdade, siga `docs/configurar-contas.md`.

## Cobertura: bancos e leiloeiros

O mapa do que existe para coletar fica em `coletor/catalogo/` (ver [docs/catalogo.md](docs/catalogo.md)):

```powershell
python -m coletor catalogo                                   # resumo da cobertura
python -m coletor catalogo oficiais                          # onde baixar as listas oficiais (juntas, tribunais)
python -m coletor catalogo importar relacao.csv --junta JUCIS-DF --uf DF
python -m coletor catalogo verificar --limite 100            # no ar? faz imóveis? plataforma?
python -m coletor catalogo criar-fontes                      # cria as fontes dos validados que fazem imóveis
python -m coletor coletar --todas
```

## Rotina automática

- No Windows: agende `scripts\coletar.ps1` no Agendador de Tarefas (3 vezes ao dia).
- No servidor: `scripts/coletar.sh` no cron.

## Trabalhando com o Claude Code

O arquivo `CLAUDE.md` descreve o projeto, as regras e os comandos. Abra a pasta no Claude Code e peça, por
exemplo: "adicione o leiloeiro X como fonte, usando o inspecionar para escolher o tipo de adaptador".
