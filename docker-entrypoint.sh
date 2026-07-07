#!/bin/sh
# Keeparr container entrypoint.
#
# SESSION_SECRET handling (the Sonarr/Seerr pattern — no required secrets at
# install): if the env var is set it wins, unchanged. Otherwise a secret is
# generated ONCE and persisted at $DATA_DIR/.session-secret, living beside the
# database it protects (it signs sessions and encrypts stored service tokens),
# so appdata backups/moves carry it automatically.
#
# This runs BEFORE node starts so every runtime — including the Edge-sandboxed
# middleware, which cannot read files — sees the same process.env value.
set -e

if [ -z "$SESSION_SECRET" ]; then
  SECRET_FILE="${DATA_DIR:-/data}/.session-secret"
  if [ ! -s "$SECRET_FILE" ]; then
    umask 077
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$SECRET_FILE"
    echo "Keeparr: generated a new session secret at $SECRET_FILE (keep this file — it encrypts your stored service tokens)"
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

exec "$@"
