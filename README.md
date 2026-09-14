# Initech Inventory

A small inventory app built to test [KantanDB](https://github.com/kantandb/server-go).

Current state: a Datastar inventory UI, a JSON CRUD API, fixture generation, and local KantanDB bootstrap.

## Setup

Install the tools, generate local files, and bootstrap KantanDB:

```sh
mise install
mise run setup
```

Start KantanDB and the app in separate terminals:

```sh
mise run db
mise run dev
```

The app listens at <http://localhost:8081>.

## Fixture statistics

Print the full report as JSON:

```sh
mise run stats
```

For a shorter report:

```sh
mise run stats -- --summary
```

The generated fixture size ~5000 records.

## Checks

Install Playwright's browser once, then run the checks:

```sh
mise run browser-install
mise run check
```

This runs Biome, contract tests, integration tests, and the Playwright smoke test.
