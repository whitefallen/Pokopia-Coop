# Pokopia-Coop

A modern web application for cooperative Pokopia planning, built from the provided CSV baseline.

## What it does

- Loads all Pokémon planning data from `pokopia_assignment - Sheet1.csv`
- Supports cooperative planning with editable owner assignment (`Thomas`, `Daniel`, `Shared`)
- Tracks migration status (`Moved`)
- Provides local-first seamless syncing between open sessions via `localStorage` + `BroadcastChannel`

## Development

```bash
npm install
npm run dev
```

## Quality and testing (core requirement)

```bash
npm run lint
npm run build
npm run test
npm run test:coverage
```

Testing is a core project fundamental:
- Unit tests verify CSV parsing and planning state update behavior.
- UI tests verify cooperative planning interactions and state persistence.

## Build

```bash
npm run build
npm run preview
```
