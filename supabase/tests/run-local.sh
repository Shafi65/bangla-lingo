#!/usr/bin/env bash
# Apply supabase/migrations to a throwaway local Postgres (with a small Supabase stand-in, see
# supabase_stub.sql) and run the RLS tests in rls_test.sql. Needs PostgreSQL 15+ binaries
# (initdb, pg_ctl, psql) on PATH or in PG_BIN. Nothing is left behind.
#
#   bash supabase/tests/run-local.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
TMP="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # Postgres refuses to run as root.
  id -u bl_pgtest >/dev/null 2>&1 || useradd -M -s /usr/sbin/nologin bl_pgtest
  chown -R bl_pgtest "$TMP"
  RUN_AS=(runuser -u bl_pgtest --)
fi
cleanup() { "${RUN_AS[@]}" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${RUN_AS[@]}" initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
export PGOPTIONS="-c client_min_messages=warning"
"${PSQL[@]}" -f "$HERE/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
# Apply twice: migrations must be re-runnable.
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
unset PGOPTIONS
"${PSQL[@]}" -o /dev/null -f "$HERE/rls_test.sql" 2>&1 | sed -n "s/.*NOTICE:  //p; /PASSED/p"
