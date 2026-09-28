# Hasta

Agregador de imóveis em leilão: Caixa, bancos, leiloeiros oficiais e tribunais numa busca só, com ficha única
por imóvel, histórico de preço e praça e calculadora de arrematação.

- `coletor/` — motor de coleta em Python (4 tipos de adaptador, normalização, deduplicação, histórico)
- `web/` — site em Next.js (busca com mapa, ficha do imóvel, painel de fontes)
- `db/` — banco PostgreSQL + PostGIS
- `docs/` — como adicionar fontes e como o sistema funciona

## Instalação no Windows (uma vez)

Instale: [Git](https://git-scm.com/download/win), [Python 3.12](https://www.python.org/downloads/)
(marque "Add python.exe to PATH"), [Node.js 22 LTS](https://nodejs.org/) e
[Docker Desktop](https://www.docker.com/products/docker-desktop/).

No PowerShell, dentro da pasta `hasta`:

```powershell
# 1. Configuração
copy .env.example .env          # depois abra o .env e preencha seu e-mail

# 2. Banco de dados
docker compose up -d

# 3. Coletor
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e "coletor[dev,navegador]"
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
python -m coletor coletar caixa      # lista da Caixa para DF e GO
python -m coletor geocodificar        # põe os imóveis no mapa (1 por segundo, é devagar na 1ª vez)
python -m coletor status
```

Se a Caixa recusar o download automático, abra o `fontes/caixa.yaml` e use `navegador: true` ou baixe os
CSV manualmente e aponte `arquivo_local`.

Quer ver o site antes de coletar? `python scripts/carregar_demo.py` carrega 9 imóveis fictícios;
`python scripts/carregar_demo.py --limpar` remove.

## Adicionando leiloeiros

Resumo (detalhes em [docs/como-adicionar-fonte.md](docs/como-adicionar-fonte.md)):

```powershell
python -m coletor catalogo                                  # cobertura atual
python -m coletor catalogo --importar relacao_jucis.csv --uf DF --junta JUCIS-DF
python -m coletor inspecionar https://site-do-leiloeiro.com.br/imoveis
python -m coletor nova-fonte https://site-do-leiloeiro.com.br/imoveis --uf DF GO
python -m coletor coletar id-da-fonte
```

## Rotina automática

- No Windows: agende `scripts\coletar.ps1` no Agendador de Tarefas (3 vezes ao dia).
- No servidor: `scripts/coletar.sh` no cron.

## Trabalhando com o Claude Code

O arquivo `CLAUDE.md` descreve o projeto, as regras e os comandos. Abra a pasta no Claude Code e peça, por
exemplo: "adicione o leiloeiro X como fonte, usando o inspecionar para escolher o tipo de adaptador".
