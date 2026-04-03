# Pokopia-Coop

A modern web application for cooperative Pokopia planning, built from the provided CSV baseline.

## What it does

- Uses `pokopia_assignment - Sheet1.csv` only as immutable baseline Pokémon data
- Keeps Pokémon definitions exactly as provided by CSV
- Stores only planning decisions in a per-session database record:
  - assigned owner (`Thomas`, `Daniel`, `Shared`)
  - moved status
- Supports multiple cooperative groups with independent planning sessions using `?session=<id>`
- Syncs updates between open clients in the same session using `BroadcastChannel`

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
- Unit tests verify CSV parsing and override application behavior.
- UI tests verify session loading and DB persistence scope.

## Build

```bash
npm run build
npm run preview
```
