# AGENTS.md - frunk Project Documentation

**⚠️ IMPORTANT: This file should be constantly updated as changes are made to the project. Future agents should read this file first and update it with any new information or changes they make.**

Last Updated: 2025-09-15 (Session 4)

## Project Overview

**frunk** is a powerful parallel script runner for npm that makes complex orchestration simple and readable. It's designed to replace tools like npm-run-all and concurrently with a more intuitive syntax and better dependency management.

### Key Features

- 🚀 Parallel execution by default
- 🔄 Sequential chains with `->` operator
- 🎯 Pattern matching with globs (`*:dev`, `build:*`)
- 🚫 Exclusion patterns with `!pattern`
- 📦 Automatic dependency resolution and deduplication
- 🎨 Colored output with task prefixes
- ⚡ Minimal overhead, maximum performance

## Current API Syntax (Square Brackets)

**IMPORTANT**: The project recently migrated from curly braces `{}` to square brackets `[]` to avoid shell expansion issues with zsh and other shells.

### Basic Syntax

```bash
f [patterns] [flags] -- command
```

### Examples

```bash
f [test:*]                          # Run all test scripts
f [build:*,!build:slow]             # Run build scripts except build:slow
f [lint,test]->[deploy]             # Sequential: lint and test, then deploy
f [shared:dep,app:dep] -- vite dev  # Run dependencies then command
```

### Flags

- `-q, --quiet` - Suppress output
- `-c, --continue` - Continue on error
- `--no-prefix` - Disable output prefixes
- `--prefix=<str>` - Custom prefix string

## Architecture

### Core Components

1. **Parser** (`src/core/parser.ts`)

   - Parses command-line arguments
   - Handles square bracket patterns `[...]`
   - Processes flags like `--quiet`, `-c`
   - Extracts commands after `--`

2. **Pattern Matcher** (`src/core/pattern-matcher.ts`)

   - Resolves glob patterns to actual script names
   - Handles exclusions (`!pattern`)
   - Supports sequential markers (`SEQ:`)
   - Uses micromatch library for glob matching

3. **Graph Builder** (`src/core/graph-builder.ts`)

   - Builds execution dependency graph
   - **Key feature**: Parses frunk commands within npm scripts
   - Automatically deduplicates shared dependencies
   - Resolves glob patterns in dependencies
   - Creates ExecutionNode structures with proper dependency chains

4. **Executor** (`src/execution/executor.ts`)

   - Executes tasks respecting dependency order
   - Handles parallel and sequential execution
   - ~~Uses `FRUNK_DEPTH` environment variable~~ (REMOVED - see Recent Changes)
   - Manages colored output through Logger
   - Runs commands through shell (`/bin/sh` on Unix, `cmd.exe` on Windows)
   - Nested frunk commands are NOT supported (throws error)

5. **Logger** (`src/utils/logger.ts`)
   - Manages colored, prefixed output
   - Each task gets a unique color
   - Aligns prefixes for readability
   - Format: `[task-name]  | output`

### Dependency Resolution

One of frunk's key features is automatic dependency resolution. When a script contains a frunk command like:

```json
{
  "scripts": {
    "shared:dep": "f -- echo 'shared'",
    "app1:dev": "f [shared:dep] -- vite dev",
    "app2:dev": "f [shared:dep] -- tsx watch",
    "dev": "f [*:dev]"
  }
}
```

Running `npm run dev` will:

1. Parse all `*:dev` scripts
2. Detect frunk commands within them
3. Build a dependency graph
4. **Deduplicate** - `shared:dep` runs only once
5. Execute in proper order

## Important Design Decisions

### Why Square Brackets?

Originally used curly braces `{}` but encountered shell expansion issues:

- zsh expands `{a,b}` to `a b`
- bash passes it through
- npm uses `/bin/sh` which doesn't expand them

Square brackets `[]` are safe across all shells and don't get expanded.

### Nested Execution Prevention

**IMPORTANT CHANGE**: Nested frunk commands (e.g., `f -- f -- command`) are now explicitly NOT supported and will throw an error. This was changed to simplify the codebase and prevent confusing behavior. The `FRUNK_DEPTH` environment variable has been removed.

### Shell Execution

Commands are executed through the shell (not directly) to match npm's behavior:

- Unix: `/bin/sh -c`
- Windows: `cmd.exe /d /s /c`

This ensures compatibility with npm scripts.

## File Structure

```
src/
├── core/
│   ├── parser.ts           # Command-line parsing
│   ├── pattern-matcher.ts  # Glob pattern resolution
│   └── graph-builder.ts    # Dependency graph construction
├── execution/
│   ├── executor.ts         # Task execution engine
│   └── runner.ts           # Main runner orchestrator
├── utils/
│   └── logger.ts           # Colored output management
├── types.ts                # TypeScript type definitions
├── cli.ts                  # CLI entry point
└── index.ts                # Library exports
```

## Testing

### Test Files

- `src/__tests__/core/parser.test.ts` - Parser tests with square bracket syntax
- `src/__tests__/core/pattern-matcher.test.ts` - Pattern matching tests
- `src/__tests__/core/graph-builder.test.ts` - Dependency graph tests
- `src/__tests__/utils/logger.test.ts` - Logger tests

### Running Tests

```bash
npm test           # Run tests in watch mode
npm test -- --run  # Run once
```

All tests have been updated to use square bracket syntax.

## Build Process

```bash
npm run build      # Build with tsdown
npm run typecheck  # TypeScript type checking
npm run dev        # Development mode with watch
```

Uses `tsdown` for building - a fast TypeScript bundler.

## Common Issues & Solutions

### 1. Shell Expansion Issues

**Problem**: Patterns get expanded by shell
**Solution**: Use square brackets `[]` instead of curly braces `{}`

### 2. Dependencies Running Multiple Times

**Problem**: Same dependency runs for each script that needs it
**Solution**: Graph builder automatically deduplicates - ensure you're using latest version

### 3. Nested Frunk Commands

**Problem**: User tries to run `f -- f -- command`
**Solution**: This is now explicitly forbidden and throws an error: "Nested frunk commands are not supported"

### 4. Commands Not Found

**Problem**: npm package binaries not accessible
**Solution**: Executor adds `node_modules/.bin` to PATH automatically

### 5. TypeScript Errors

**Problem**: Missing type definitions
**Solution**: Install `@types/debug` and `@types/micromatch`

## Recent Changes

### 2025-09-15 (Session 4)

1. Verified command pass-through with repeated `--` works (e.g., `f -- next serve -- --trace-deprication`).
2. Added test `src/__tests__/execution/command-forwarding.test.ts` that stubs a local `next` binary and asserts arguments are forwarded unchanged.
3. Fixed bug: command after `--` not executed when patterns present. GraphBuilder now adds a final "command" node depending on selected scripts.
4. Added safe script `release:dry` to run `f [build] -- node -e ...` without publishing.
5. Added tmp harness `tmp/release-check` to validate dependency-then-command flow without network/publish.

### 2025-09-14 (Session 3)

1. README overhaul: concise layout with badges (npm version, license)
2. Installation clarified: recommend dev dependency (`npm i -D frunk`)
3. Quickstart: uses `frunk` with note that `f` is a short alias; rest of README uses `f`
4. Moved docs section (syntax: `[]`, `->`, globs, `--`, flags) above the medium-sized example and expanded explanations beyond bullets
5. Removed downloads/CI/node badges; tagline updated to “supercharging npm scripts”
6. Simplified medium example to only include `api`, `app` (vite), and `worker` dev scripts plus a shared dependency

### 2025-01-14 (Session 2)

1. **REMOVED FRUNK_DEPTH**: Completely removed the `FRUNK_DEPTH` environment variable and nested execution detection
2. **Nested Commands Forbidden**: Added explicit check to throw error if user tries `f -- f` or `f -- frunk`
3. **Test Coverage**: Increased test coverage to >80% with comprehensive test suite
4. **Linting Fixes**: Fixed all linting issues (88 → 0), using biome with strict rules
5. **Type Safety**: Fixed all TypeScript type errors, including proper environment variable access
6. **Test Added**: Added test for nested frunk command detection/prevention

### 2025-01-14 (Session 1)

1. **API Change**: Migrated from `{patterns}` to `[patterns]` syntax
2. **Config Change**: From `[service,quiet]` to standard flags `--quiet`, `-c`
3. **Dependency Resolution**: Added automatic parsing of frunk commands in scripts
4. **Deduplication**: Shared dependencies now run only once
5. **Debug Logging**: Added debug library for troubleshooting (`DEBUG=frunk:*`)
6. **Test Updates**: All tests updated for new syntax
7. **README Update**: Complete documentation rewrite with new examples
8. **Graph Library**: Refactored to use `graphlib` for cleaner graph management
   - Automatic cycle detection with `alg.isAcyclic()`
   - Topological sorting with `alg.topsort()`
   - Cleaner dependency resolution code
   - Better maintainability with battle-tested algorithms

## Debug Mode

Enable debug logging:

```bash
DEBUG=frunk:* npm run dev
DEBUG=frunk:graph npm run dev     # Just graph builder
DEBUG=frunk:executor npm run dev  # Just executor
```

## Package.json Scripts Example

```json
{
  "scripts": {
    "// Dependencies": "",
    "shared:dep": "f -- echo 'Building shared'",
    "api:dep": "f -- tsc --build api",

    "// Development": "",
    "api:dev": "f [shared:dep,api:dep] -- nodemon api/server.ts",
    "web:dev": "f [shared:dep] -- vite dev",
    "worker:dev": "f [shared:dep] -- tsx watch worker.ts",
    "dev": "f [*:dev]",

    "// Building": "",
    "build": "f [clean]->[build:*]",
    "build:api": "f -- tsc --build",
    "build:web": "f -- vite build",

    "// Testing": "",
    "test": "f [lint,typecheck]->[test:*]",
    "test:unit": "f -- vitest",
    "test:e2e": "f [build] -- playwright test"
  }
}
```

## NPM Publishing

The project is set up for automated npm publishing via GitHub Actions:

- Trigger: Push to main with version tag (e.g., `v1.0.0`)
- Uses NPM_TOKEN secret for authentication
- Publishes to npm registry automatically

## Future Improvements

1. **Watch Mode**: Add built-in file watching support
2. **Better Error Messages**: More descriptive error messages for common issues
3. **Performance**: Further optimize dependency graph resolution
4. **Configuration File**: Support `.frunkrc` for project-wide settings
5. **Interactive Mode**: Add interactive task selection
6. **Task Caching**: Cache task outputs for faster re-runs

## Tips for Future Agents

1. **Always test with real npm scripts** - The interaction between frunk, npm, and shells is complex
2. **Check shell compatibility** - Test with bash, zsh, and sh
3. **Preserve backward compatibility** - Many projects may depend on current syntax
4. **Update tests first** - Change tests before implementation
5. **Use debug logging** - Add debug() calls when troubleshooting
6. **~~Test nested execution~~** - Nested frunk commands are now forbidden
7. **Update this file** - Document any changes you make!

## Related Files

- `README.md` - User-facing documentation
- `package.json` - Project configuration and scripts
- `.github/workflows/release.yml` - Automated npm publishing
- `tsdown.config.ts` - Build configuration
- `vitest.config.ts` - Test configuration

## Contact & Support

- GitHub: https://github.com/[owner]/frunk
- npm: https://www.npmjs.com/package/frunk
- Issues: Report bugs via GitHub Issues

---

**Remember**: This documentation is critical for maintaining the project. Update it whenever you make changes, discover new issues, or implement new features. Future agents depend on this information being accurate and complete.
