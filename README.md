# Initech Inventory

A small inventory app built to test [KantanDB](https://github.com/kantandb/server-go). It uses Bun on the server and Datastar in the browser.

The project is still under construction. The backend now has inventory validation, fixture generation, KantanDB bootstrap, and a JSON CRUD API.

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

```sh
mise run check
```

This runs Biome, Bun tests, and Playwright tests.
