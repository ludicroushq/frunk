# frunk 🚀

A powerful parallel script runner for npm that makes complex orchestration simple and readable.

## Features

- 🚀 **Parallel by default** - Run multiple scripts simultaneously
- 🔄 **Sequential chains** - Easy dependency management with `->`
- 🎯 **Pattern matching** - Use globs to run multiple scripts (`*:dev`)
- 🚫 **Exclusions** - Skip specific scripts with `!pattern`
- 📦 **Dependency resolution** - Automatically deduplicates and runs shared dependencies
- 🎨 **Colored output** - Each script gets its own color
- ⚡ **Fast** - Minimal overhead, maximum performance

## Installation

```bash
npm install -g frunk
# or as a dev dependency
npm install --save-dev frunk
```

## Quick Start

```json
{
  "scripts": {
    "dev": "f [*:dev]",
    "build": "f [build:*]",
    "test": "f [lint,typecheck]->[test:*]",
    "start": "f [build] -- node server.js"
  }
}
```

## Usage

### Basic Syntax

```bash
f [patterns] [flags] -- command
```

- `[...]` - **Pattern group**: Scripts to run (parallel by default)
- `--flag` - **Optional**: Configuration flags
- `--` - **Optional**: Separator before inline command

### Examples

#### Run all dev scripts in parallel
```json
"dev": "f [*:dev]"
```

#### Run with dependencies
```json
"app:dev": "f [shared:dep,app:dep] -- vite dev"
```

#### Sequential execution
```json
"deploy": "f [test:*]->[build:*]->[deploy:prod]"
```

#### Exclude patterns
```json
"test:most": "f [test:*,!test:e2e]"
```

## Pattern Matching

- `*:dev` - All scripts ending with `:dev`
- `build:*` - All scripts starting with `build:`
- `test:unit` - Exact match
- `[a,b,c]` - Multiple patterns (parallel)
- `!pattern` - Exclude pattern

## Configuration Flags

### Standard Flags
- `-q, --quiet` - Suppress output
- `-c, --continue` - Continue on error
- `--no-prefix` - Disable name prefixes
- `--prefix=<str>` - Custom prefix

### Examples
```bash
f [test:*] -q                    # Run tests quietly
f [build:*] -c                   # Continue on build errors
f [dev:*] --prefix="►"           # Custom prefix
f [lint,test] --no-prefix        # No prefixes
```

## Advanced Usage

### Dependency Resolution

frunk automatically builds a dependency graph and deduplicates shared dependencies:

```json
{
  "scripts": {
    "shared:dep": "echo 'shared dependency'",
    "discord:dep": "echo 'discord specific'",
    "start:dep": "echo 'start specific'",
    
    "discord:dev": "f [shared:dep,discord:dep] -- tsx --watch discord.ts",
    "start:dev": "f [shared:dep,start:dep] -- vite dev",
    "worker:dev": "f [shared:dep] -- tsx --watch worker.ts",
    
    "dev": "f [*:dev]"
  }
}
```

When you run `npm run dev`, `shared:dep` runs only once, even though it's a dependency of all three dev scripts.

### Complex Dependency Chains

```json
{
  "scripts": {
    "ci": "f [install,audit]->[lint,typecheck]->[test:*]->[build]",
    "release": "f [test:*]->[build:*]->[publish,deploy]"
  }
}
```

### Microservices Setup

```json
{
  "scripts": {
    "dev": "f [db:start]->[migrate,seed]->[*:dev]",
    "api:dev": "f -- nodemon api/server.js",
    "web:dev": "f -- vite",
    "worker:dev": "f -- tsx watch worker.ts"
  }
}
```

### Mixed Parallel and Sequential

```json
{
  "scripts": {
    "deploy": "f [lint,test:unit]->[build:app,build:docker]->[deploy:k8s]"
  }
}
```

## Real-World Example

```json
{
  "scripts": {
    "// Development": "",
    "dev": "f [*:dev]",
    "api:dev": "f [codegen:watch] -- nodemon server.ts",
    "web:dev": "f [build:css] -- vite",
    "worker:dev": "f -- tsx watch worker.ts",
    
    "// Dependencies": "",
    "codegen:watch": "f -- graphql-codegen --watch",
    "build:css": "f -- tailwind build --watch",
    
    "// Building": "",
    "build": "f [clean]->[build:*]",
    "build:css": "f -- tailwind build",
    "build:js": "f -- vite build",
    "build:types": "f -- tsc",
    
    "// Testing": "",
    "test": "f [build:types]->[test:*,!test:e2e]",
    "test:unit": "f -- vitest",
    "test:integration": "f -- vitest integration",
    "test:e2e": "f [build] -- playwright test",
    
    "// CI/CD": "",
    "ci": "f [install]->[lint,typecheck]->[test:*]->[build]",
    "deploy": "f [ci]->[deploy:prod]",
    
    "// Utilities": "",
    "clean": "f -- rm -rf dist",
    "lint": "f -- eslint .",
    "typecheck": "f -- tsc --noEmit"
  }
}
```

## Help

Run `f --help` to see all available options:

```
frunk - A parallel script runner for npm scripts

Usage:
  f [patterns] [flags] -- command

Patterns:
  [test:*]              Run all scripts matching test:*
  [build:*,!build:slow] Run build scripts except build:slow
  [a]->[b]->[c]         Run a, then b, then c (sequential)
  [a,b]->[c,d]          Run a and b in parallel, then c and d

Flags:
  -q, --quiet           Suppress output
  -c, --continue        Continue on error
  --no-prefix           Disable output prefixes
  --prefix=<str>        Custom prefix

Examples:
  f [test:*]                     Run all test scripts
  f [build] -- node app.js       Run build, then run command
  f [lint,test]->[deploy]        Lint and test, then deploy
  f [test:*] -q -- echo done     Run tests quietly

Aliases:
  f     Short for frunk
```

## Comparison with Other Tools

| Feature | frunk | npm-run-all | concurrently | wireit |
|---------|-------|-------------|--------------|--------|
| Parallel execution | ✅ | ✅ | ✅ | ✅ |
| Sequential chains | ✅ | ✅ | ❌ | ✅ |
| Pattern matching | ✅ | ✅ | ❌ | ❌ |
| Dependency graph | ✅ | ❌ | ❌ | ✅ |
| Deduplication | ✅ | ❌ | ❌ | ✅ |
| Inline commands | ✅ | ❌ | ✅ | ❌ |
| Colored output | ✅ | ✅ | ✅ | ✅ |
| Custom prefixes | ✅ | ❌ | ✅ | ❌ |
| Zero config | ✅ | ✅ | ✅ | ❌ |

## Why frunk?

1. **Intuitive Syntax** - `[deps]->[task]` is clearer than complex config files
2. **Dependency Resolution** - Automatically deduplicates and manages dependencies
3. **Fast** - Minimal overhead, no config files to parse
4. **Powerful** - Full dependency graph resolution
5. **Modern** - Built with TypeScript, ESM, and modern Node.js

## API

frunk can also be used programmatically:

```typescript
import { Runner } from 'frunk';

const runner = new Runner();
await runner.run(
  ['[build:*]', '-q', '--', 'echo done'],
  scripts,
  { cwd: process.cwd() }
);
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © 2024

---

**Short alias**: Use `f` instead of `frunk` for even shorter commands!

```bash
f [test:*]                    # Run all tests
f [build] -- node app.js      # Build then run
f [*:dev]                     # Start all dev scripts
```