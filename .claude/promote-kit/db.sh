#!/usr/bin/env bash
# db.sh — psql against the LOCAL stack database only (postgres://lgi:lgi@localhost:5433/lgi_tools).
#
#   ./db.sh -c "select ..."                      any psql arguments
#   ./db.sh -f mock.sql
#   ./db.sh snapshot <table> <key-col> "<where>" <file.csv>   save rows before mocking them
#   ./db.sh restore  <table> <key-col> <file.csv>              put those rows' columns back
#
# restore UPDATEs every column of each saved row in place (matched on <key-col>), so it never
# deletes or re-inserts rows and nothing cascades. Rows inserted after the snapshot are not touched;
# delete those yourself.
set -euo pipefail
export PGHOST=localhost PGPORT=5433 PGUSER=lgi PGPASSWORD=lgi PGDATABASE=lgi_tools
unset DATABASE_URL PGSERVICE
ident() { [[ "$1" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "bad identifier: $1" >&2; exit 2; }; }

case "${1:-}" in
  snapshot)
    [ $# -eq 5 ] || { echo "usage: $0 snapshot <table> <key-col> \"<where>\" <file.csv>" >&2; exit 2; }
    ident "$2"; ident "$3"
    psql -v ON_ERROR_STOP=1 -qc "\\copy (select * from public.\"$2\" where $4 order by \"$3\") to '$5' with (format csv, header)"
    echo "saved $(($(wc -l < "$5") - 1)) row(s) of $2 to $5"
    ;;
  restore)
    [ $# -eq 4 ] || { echo "usage: $0 restore <table> <key-col> <file.csv>" >&2; exit 2; }
    ident "$2"; ident "$3"
    psql -v ON_ERROR_STOP=1 -q <<SQL
begin;
create temp table _kit_snap (like public."$2") on commit drop;
\copy _kit_snap from '$4' with (format csv, header)
do \$\$
declare cols text; n int;
begin
  select string_agg(format('%I = s.%I', column_name, column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = '$2' and column_name <> '$3'
     and is_generated = 'NEVER';
  execute format('update public.%I t set %s from _kit_snap s where t.%I = s.%I', '$2', cols, '$3', '$3');
  get diagnostics n = row_count;
  raise notice 'restored % row(s) of $2', n;
end \$\$;
commit;
SQL
    ;;
  *)
    exec psql -v ON_ERROR_STOP=1 "$@"
    ;;
esac
