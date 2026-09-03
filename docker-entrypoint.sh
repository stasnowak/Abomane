#!/bin/sh
set -e

# Migrations run before the server binds, so a failed upgrade stops the
# container with a clear error instead of surfacing on a user's first request.
echo "[abomane] applying migrations"
node /app/scripts/migrate.mjs

echo "[abomane] starting server on ${HOST:-0.0.0.0}:${PORT:-4321}"
exec "$@"
