#!/usr/bin/env bash
# Para o servidor (VPS). Agende no cron, ex.: 0 6,13,20 * * * /opt/hasta/scripts/coletar.sh
set -e
cd "$(dirname "$0")/../coletor"
../.venv/bin/python -m coletor coletar --todas >> ../dados/coleta.log 2>&1
../.venv/bin/python -m coletor geocodificar --limite 300 >> ../dados/coleta.log 2>&1
