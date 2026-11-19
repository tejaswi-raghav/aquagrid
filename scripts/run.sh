#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -c 'import fastapi,uvicorn' 2>/dev/null || .venv/bin/pip install -r requirements.txt
if [ -z "${AQUAGRID_OPERATOR_PASSWORD:-}" ]; then
  printf 'Choose a demo operator password: '
  stty -echo
  read -r AQUAGRID_OPERATOR_PASSWORD
  stty echo
  printf '\n'
  export AQUAGRID_OPERATOR_PASSWORD
fi
exec .venv/bin/uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
