# frunk — supercharging npm scripts

[![npm version](https://img.shields.io/npm/v/frunk.svg?logo=npm)](https://www.npmjs.com/package/frunk)
[![license](https://img.shields.io/npm/l/frunk.svg)](https://www.npmjs.com/package/frunk)

frunk is a fast, lightweight runner for orchestrating npm scripts. It runs tasks in parallel by default, supports readable sequential chains with `->`, and resolves dependencies across scripts with automatic deduplication.

## Highlights

- 🚀 Parallel by default: run many scripts at once
- 🔗 Sequential chains: `[a,b]->[c]` for clear order
- 🎯 Globs and excludes: `*:dev`, `build:*`, `!test:e2e`
- 📦 Dependency graph: dedupe shared deps across scripts
- 🎨 Clean output: colored, aligned, prefixed logs

## Installation

Install as a dev dependency:

```bash
npm i -D frunk
# pnpm add -D frunk
# yarn add -D frunk
```

## Quickstart

Add a few scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "frunk [*:dev]",
    "build": "frunk [build:*]",
    "start": "frunk [build] -- node server.js",

    // full example
    "test": "frunk [lint,typecheck]->[test:*]",
    "lint": "frunk -- eslint .",
    "typecheck": "frunk -- tsc --noEmit",
    "test:unit": "frunk -- vitest run",
    "test:playwright": "frunk [build] -- playwright test"
  }
}
```

Tip: You can shorten `frunk` to `f` (used below).

## Comparison

| Feature             | frunk | npm-run-all | concurrently | wireit |
| ------------------- | ----- | ----------- | ------------ | ------ |
| Parallel by default | ✅    | ✅          | ✅           | ➖     |
| Sequential chains   | ✅    | ✅          | ➖           | ✅     |
| Globs/excludes      | ✅    | ✅          | ➖           | ➖     |
| Dep graph + dedupe  | ✅    | ➖          | ➖           | ✅     |
| Colored prefixes    | ✅    | ➖          | ✅           | ➖     |

## Docs

### Syntax

`f [patterns] [flags] -- command`

frunk runs bracketed pattern groups. Tasks inside a single group run in parallel. Use `->` to chain groups so that all tasks in the left group finish before the next group starts. Anything after `--` is treated as a shell command and executed once the preceding groups complete.

### Pattern Matching

Patterns resolve to npm script names:

- Exact names: `test:unit` runs that script if present.
- Globs: `build:*`, `*:dev` match multiple scripts using shell-safe micromatch patterns.
- Exclusions: prefix with `!` to omit matches, e.g. `[test:*,!test:e2e]`.
- Parallel sets: comma‑separate inside a group, e.g. `[lint,typecheck]`.
- Sequencing: chain groups with `->`, e.g. `[lint,typecheck]->[build]`.

Square brackets are required. They prevent shell expansion and make intent explicit.

### Command Separator `--`

Place `--` before an inline command to run after the selected groups complete, e.g. `[build] -- node server.js`. The command runs through your system shell and inherits `PATH` including `node_modules/.bin`.

### Flags

- `-q, --quiet`: Reduce noise by hiding task output.
- `-c, --continue`: Don’t stop the run on failure; continue running remaining tasks/groups.
- `--no-prefix`: Disable the colored `[script] |` prefixes.
- `--prefix=<str>`: Replace the default prefix label with a custom string.

By default, failures stop downstream groups. Use `-c` to keep going when some tasks fail.

### Notes

- Nested frunk commands are not supported.
- Output is colorized and aligned with stable, per‑task prefixes.

## Example

Medium-size setup showing shared deps, parallel groups, and sequences:

```json
{
  "scripts": {
    "generate": "graphql-codegen",
    "dev": "f [*:dev]",
    "build": "f [*:build]",
    "start": "f [*:start]",
    "test": "frunk [lint,typecheck]->[test:*]",

    "lint": "frunk -- eslint .",
    "typecheck": "frunk -- tsc --noEmit",
    "test:unit": "frunk -- vitest run",
    "test:playwright": "frunk [build] -- playwright test",

    "worker:dev": "f -- tsx --watch ./src/worker/start.ts",
    "worker:start": "f -- tsx ./src/worker/start.ts",

    "api:dev": "f -- tsx --watch ./src/api/server.ts",
    "api:start": "f -- tsx ./src/api/server.ts",

    "app:dev": "f [generate] -- vite dev",
    "app:build": "f [generate] -- vite build",
    "app:start": "f -- vite serve"
  }
}
```

Running `npm run dev` executes `shared:dep` once, even though multiple dev tasks depend on it.

## Links

- Repo: https://github.com/ludicroushq/frunk
- npm: https://www.npmjs.com/package/frunk
- Issues: https://github.com/ludicroushq/frunk/issues
