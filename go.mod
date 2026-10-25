module github.com/davinakmalyasha/4ceria

go 1.27.2

require gopkg.in/yaml.v3 v3.0.1

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/go-sql-driver/mysql v1.9.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.11.0 // indirect
	golang.org/x/text v0.29.0 // indirect
)

// The Composer dependencies and the npm packages are not Go code.
ignore (
	./node_modules
	./vendor
)
