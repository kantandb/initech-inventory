# Initech Inventory

A small inventory app built to test [KantanDB](https://github.com/kantandb/server-go). It uses Bun on the server and Datastar in the browser.

The project is still under construction. Right now it includes the application scaffold, KantanDB OpenAPI specs download, inventory validation, and a deterministic fixture generator.

## Setup

Install the tools and generate local files:

```sh
mise install
mise run openapi
mise run fixture
```

Start the app at <http://localhost:8081>:

```sh
mise run dev
```

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
