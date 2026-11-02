# The frozen MySQL schema

MySQL still owns **identity** (ADR-0018): `users`, `personal_access_tokens`,
the Spatie role tables and the tables they reference. Everything else lives in
PostgreSQL.

## Why a dump instead of migrations

The schema used to be created by 240 Laravel migrations. The Laravel
application is gone; the data it produced is not. The schema is therefore
frozen at its last applied state and checked in as SQL:

| File | Contents |
|---|---|
| `schema.sql` | 98 tables, structure only (no rows). |
| `demo.sql` | The local demo dataset, used by CI and for a fresh development database. |

`demo.sql` deliberately omits the volatile auth tables (`personal_access_tokens`,
`password_reset_tokens`, `sessions`, `cache*`, `jobs*`): a session token in a
committed dump is a credential, and a fresh environment mints its own on the
first login. `schema.sql` still creates the tables.

Both are regenerated from a live database:

```bash
mysqldump -uroot --no-data --skip-comments --skip-triggers \
  --no-tablespaces --set-gtid-purged=OFF 4ceria > db/mysql/schema.sql

mysqldump -uroot --skip-comments --skip-triggers --no-tablespaces \
  --set-gtid-purged=OFF --single-transaction --complete-insert \
  4ceria > db/mysql/demo.sql
```

## Restoring

```bash
mysql -uroot -e 'CREATE DATABASE 4ceria'
mysql -uroot 4ceria < db/mysql/schema.sql
mysql -uroot 4ceria < db/mysql/demo.sql
```

## Changing it

The schema is append-only in spirit: a new enum value is appended, never
reordered, and never removed (a `MODIFY COLUMN` on an `ENUM` is a full table
rebuild that aborts if a row holds a dropped value). Update `schema.sql`,
`spec/enums.yaml` and the matching PostgreSQL enum in the same change.

When identity moves to PostgreSQL, these files and `cmd/etl` are deleted
together.
