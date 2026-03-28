#!/bin/sh
set -eu

if [ "${RUN_DB_MIGRATE:-0}" = "1" ]; then
  echo "[entrypoint] running database migrations"
  node dist/scripts/run-question-bank-migrations.js
fi

exec node dist/server.js
