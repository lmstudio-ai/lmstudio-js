# CLAUDE.md - LM Studio JavaScript SDK

This document provides a comprehensive guide to the lmstudio-js codebase structure, development workflows, and conventions for AI assistants working on this project.

## Project Overview

**LM Studio JavaScript/TypeScript SDK** is the official client SDK for interacting with LM Studio, enabling developers to use local LLMs in JavaScript/TypeScript applications.

### Key Capabilities
- Chat completions and text predictions with local LLMs
- Autonomous AI agents with function calling/tools
- Model lifecycle management (load/configure/unload)
- Embedding generation
- File operations and retrieval
- Plugin development for LM Studio
- Model repository access

### Technology Stack
- **Language**: TypeScript 5.7.3 (strict mode)
- **Runtime**: Node.js ^20.12.2
- **Package Manager**: npm@10.5.0
- **Monorepo Tools**: Lerna 8.1.2, Turbo 2.5.4
- **Bundling**: Rollup 4.27.4, API Extractor 7.40.1
- **Testing**: Jest 30.0.0-alpha.7 with @swc/jest
- **Code Quality**: ESLint 8.56.0, Prettier 3.2.5

## Repository Structure

### Monorepo Organization

```
/home/user/lmstudio-js/
├── packages/              # Core internal packages (17 packages)
│   ├── lms-shared-types/            # Base type definitions (Zod schemas)
│   ├── lms-isomorphic/              # Platform-agnostic utilities
│   ├── lms-common/                  # Reactive primitives, utilities
│   ├── lms-common-server/           # Server-side utilities
│   ├── lms-kv-config/               # Type-safe configuration system
│   ├── lms-communication/           # RPC/WebSocket foundation
│   ├── lms-communication-client/    # Client WebSocket implementation
│   ├── lms-communication-server/    # Server WebSocket implementation
│   ├── lms-communication-mock/      # Mock for testing
│   ├── lms-external-backend-interfaces/ # Backend API contracts
│   ├── lms-client/                  # Main SDK implementation (~12k LOC)
│   ├── lms-lmstudio/                # LM Studio specific implementations
│   ├── lms-es-plugin-runner/        # Plugin execution environment
│   ├── lms-json-schema/             # JSON schema generation
│   ├── lms-cli/                     # CLI package
│   └── template/                    # Package template
│
├── publish/               # Publishable artifacts (4 packages)
│   ├── sdk/              # @lmstudio/sdk - Main public SDK
│   ├── cli/              # @lmstudio/cli - CLI binaries
│   ├── lmstudio/         # lmstudio package
│   └── lms/              # lms package
│
├── scaffolds/             # Project templates
│   ├── node-typescript/
│   ├── node-typescript-empty/
│   ├── node-javascript/
│   └── node-javascript-empty/
│
├── scripts/               # Build and development utilities
├── patches/               # npm package patches (patch-package)
└── .github/               # CI/CD workflows
```

### Key Configuration Files

- `lerna.json` - Independent versioning for monorepo packages
- `turbo.json` - Build orchestration with dependency graph
- `tsconfig.build.json` - TypeScript project references (root)
- `jest.config.js` - Jest testing configuration
- `.eslintrc.json` - Code quality rules
- `.prettierrc.json` - Code formatting rules
- `package.json` - Root workspace configuration

## Development Setup

### Initial Setup

```bash
git clone https://github.com/lmstudio-ai/lmstudio-js.git --recursive
cd lmstudio-js
npm install  # Runs postinstall: patch-package + turbo postinstall
```

### Project References

The monorepo uses TypeScript project references for incremental builds. All packages are referenced in `tsconfig.build.json`.

## Build System & Workflow

### Build Architecture

Each internal package produces **three output formats**:
1. **CommonJS** - `dist/cjs/*.js` (via `tsconfig.cjs.json`)
2. **ES Modules** - `dist/esm/*.js` + `dist/esm/package.json` (via `tsconfig.esm.json`)
3. **Type Declarations** - `dist/types/*.d.ts` (via `tsconfig.types.json`)

The published SDK (`@lmstudio/sdk`) bundles everything into:
- `dist/index.cjs` - Single CJS bundle
- `dist/index.mjs` - Single ESM bundle
- `dist/index.d.ts` - Single consolidated type declaration

### Development Commands

```bash
# Watch mode (development)
npm start              # Generate ESM package.json + turbo watch
npm run watch          # TSC watch + turbo watch (concurrent)

# Building
npm run build          # Full clean build (clean + gen + turbo build + scaffolds)
npm run build-sdk      # Build SDK only
npm run build-cli      # Build CLI only
npm run build-lmstudio # Build lmstudio package only

# Testing
npm test               # Standard tests (excludes *.heavy.test.ts)
npm test-sequential    # Run tests in band
npm test-full          # All tests including heavy integration tests
npm test-watch         # Watch mode for tests

# Publishing
npm run make           # Production build + CLI binary
npm run publish        # Build + lerna publish (no git tags)

# Utilities
npm run clean          # Remove .turbo and all dist directories
npm run gen            # Generate ESM package.json files
npm run build-scaffolds-json       # Generate scaffold manifest
npm run upload-scaffolds-manifest  # Upload scaffolds to S3
```

### Build Process Flow

1. **Clean** - Remove all build artifacts and turbo cache
2. **Generate** - Create `dist/esm/package.json` files with `{"type": "module"}`
3. **TypeScript Compilation** - Parallel builds using project references
   - Each package builds: CJS, ESM, and Types concurrently
   - Turbo orchestrates based on dependency graph
   - Maximum concurrency: 25
4. **SDK Bundling** - Rollup bundles internal packages
   - API Extractor consolidates type declarations
5. **CLI Binaries** - Platform-specific executables (Windows/Linux/macOS)

### Turbo Configuration

```json
{
  "concurrency": "25",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "ts-out/**"]
    },
    "watch": {
      "dependsOn": ["^build"],
      "persistent": true
    }
  }
}
```

## Package Architecture & Dependencies

### Dependency Hierarchy (Bottom-Up)

```
┌─────────────────────────────────────────────────────────────┐
│                        @lmstudio/sdk                        │
│                    (Published Bundle)                       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│                        lms-client                           │
│                  (Main SDK Implementation)                  │
│     Namespaces: llm, embedding, files, plugins, etc.       │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┬───────────────────────────────┐
│  lms-external-backend-      │  lms-communication-client     │
│      interfaces             │                               │
│  (Backend API Contracts)    │  (WebSocket Client)           │
└─────────────────────────────┴───────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┬───────────────────────────────┐
│    lms-communication        │       lms-common              │
│   (RPC/Channel/Signal)      │  (Reactive Primitives)        │
└─────────────────────────────┴───────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┬───────────────────────────────┐
│    lms-shared-types         │      lms-isomorphic           │
│    (Base Zod Schemas)       │  (Platform Utilities)         │
└─────────────────────────────┴───────────────────────────────┘
```

### Package Responsibilities

#### Foundation Layer
- **lms-shared-types** - Core type definitions, Zod schemas (~11k+ lines)
- **lms-isomorphic** - Platform-agnostic WebSocket abstractions

#### Utilities Layer
- **lms-common** - Reactive primitives (Signal, Event, LazySignal), utilities
- **lms-kv-config** - Type-safe key-value configuration
- **lms-common-server** - Server-side common utilities

#### Communication Layer
- **lms-communication** - BackendInterface, Channel, Transport abstractions
- **lms-communication-client** - Client-side implementation
- **lms-communication-server** - Server-side implementation
- **lms-communication-mock** - Mock for testing

#### Backend Layer
- **lms-external-backend-interfaces** - Defines API contracts for:
  - LLM operations
  - Embedding generation
  - File/retrieval operations
  - Repository access
  - System management
  - Diagnostics

#### Client Layer
- **lms-client** - Main SDK with namespaces:
  - `llm/` - LLM operations, chat, completion, tool calling, agent (act)
  - `embedding/` - Embedding models
  - `files/` - File handling and retrieval
  - `plugins/` - Plugin development APIs
  - `repository/` - Model repository access
  - `runtime/` - Runtime management
  - `system/` - System information
  - `diagnostics/` - Diagnostics APIs

### Package.json Structure

All packages follow this pattern:

```json
{
  "name": "@lmstudio/package-name",
  "version": "x.y.z",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "require": "./dist/cjs/index.js",
      "import": "./dist/esm/index.js",
      "default": "./dist/esm/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "shx rm -rf ./dist ./tsconfig.tsbuildinfo"
  }
}
```

## Code Conventions & Standards

### TypeScript Configuration

- **Strict mode enabled** across all packages
- **Project references** for incremental compilation
- **Triple compilation**: CJS, ESM, and Types
- Each package has 4 tsconfig files:
  - `tsconfig.json` - Base configuration
  - `tsconfig.cjs.json` - CommonJS output
  - `tsconfig.esm.json` - ES Module output
  - `tsconfig.types.json` - Type declarations

### ESLint Rules

Key rules from `.eslintrc.json`:

```json
{
  "@typescript-eslint/no-unused-vars": ["warn", {
    "varsIgnorePattern": "^_",
    "argsIgnorePattern": "^_"
  }],
  "@typescript-eslint/consistent-type-imports": ["error", {
    "prefer": "type-imports",
    "fixStyle": "inline-type-imports"
  }],
  "tsdoc/syntax": "warn"
}
```

**Important Conventions:**
- Prefix unused variables with `_` to avoid warnings
- Use `import { type Foo }` for type-only imports
- Write TSDoc comments for public APIs
- No explicit `any` warnings (disabled)

### Prettier Configuration

```json
{
  "printWidth": 100,
  "quoteProps": "consistent",
  "arrowParens": "avoid",
  "trailingComma": "all",
  "tabWidth": 2,
  "tabs": false
}
```

### Code Style

1. **Module Exports**: Use named exports, not default exports
2. **Type Imports**: Always use inline type imports when importing only types
3. **Documentation**: Use TSDoc comments (`/** ... */`) for public APIs
4. **Reactive Primitives**: Use Signal, Event, LazySignal from lms-common
5. **Validation**: Use Zod schemas for runtime validation
6. **Error Handling**: Use custom error types from lms-common
7. **Immutability**: Use Immer for state updates
8. **Side Effects**: Mark packages as `"sideEffects": false` when appropriate

### Architectural Patterns

1. **Backend Interface Pattern**
   - Define typed RPC/Channel/Signal endpoints
   - Separate interface definition from implementation
   - Use Zod for runtime validation

2. **Namespace Organization**
   - Group related functionality in namespaces
   - Access via `client.namespace.method()`

3. **Handle Pattern**
   - Use abstract handles for dynamic resources
   - Examples: `LLMDynamicHandle`, `EmbeddingDynamicHandle`, `FileHandle`

4. **Reactive Programming**
   - Use `Signal<T>` for observable values
   - Use `Event<T>` for event emitters
   - Use `LazySignal<T>` for computed values

5. **Plugin Architecture**
   - Extensible via plugin interfaces
   - Support for prediction handlers, preprocessors, tool providers

## Testing Practices

### Test Organization

- **Unit tests**: `*.test.ts` - Fast, isolated tests
- **Integration tests**: `*.heavy.test.ts` - Require running LM Studio
- Tests co-located with source code
- 27+ unit test files, 8+ integration test files

### Jest Configuration

```javascript
{
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
  testEnvironment: "node",
  snapshotResolver: "./jestSnapshotResolver.js",
  collectCoverage: true,
  resolver: "jest-ts-webcompat-resolver"
}
```

### Testing Guidelines

1. **Write tests for new functionality** - Include unit tests with new features
2. **Update tests when changing behavior** - Keep tests synchronized
3. **Use snapshot testing** for complex outputs
4. **Test edge cases** - Include boundary conditions
5. **Mock external dependencies** - Use `lms-communication-mock` for testing
6. **Run tests before committing**:
   ```bash
   npm test          # Quick test run
   npm test-full     # Comprehensive test run
   ```

## Git Workflow & Branch Management

### Branch Strategy

- **Main branch**: `main` (or master) - Stable, production-ready code
- **Feature branches**: Use descriptive names like `feature/add-streaming-support`
- **Claude branches**: When working with Claude, branches follow pattern `claude/*-{session-id}`

### Commit Guidelines

1. **Write clear commit messages**
   - Start with a verb (Add, Fix, Update, Remove, Refactor)
   - Be concise but descriptive
   - Example: "Add streaming support for chat completions"

2. **Keep commits focused**
   - One logical change per commit
   - Don't mix refactoring with feature additions

3. **Reference issues**
   - Use "Fixes #123" or "Resolves #456" in commit messages

### Pull Request Guidelines

From CONTRIBUTING.md:

1. **Communicate first**
   - Comment on existing issues before working
   - Discuss new features before implementing
   - No drive-by feature PRs without discussion

2. **Keep PRs small and focused**
   - Address one concern per PR
   - Easier to review, faster to merge

3. **Write thoughtful descriptions**
   - Explain what and why
   - Include before/after states or screenshots
   - Reference related issues

4. **Quality expectations**
   - Follow existing code style
   - Include tests for new functionality
   - Ensure all tests pass
   - Update documentation

5. **CLA Required**
   - Sign Contributor License Agreement
   - Bot will comment on first PR with instructions

## Making Changes

### Adding a New Package

1. Create directory in `packages/` or `publish/`
2. Copy structure from `packages/template/`
3. Create 4 tsconfig files (json, cjs, esm, types)
4. Add to `tsconfig.build.json` references
5. Set up package.json with exports
6. Run `npm install` to link workspaces

### Modifying Existing Packages

1. **Always read the file first** before editing
2. **Understand dependencies** - Check what depends on your changes
3. **Update types** - Modify Zod schemas in lms-shared-types if needed
4. **Test thoroughly**:
   ```bash
   npm test           # Unit tests
   npm test-full      # All tests
   ```
5. **Build to verify**:
   ```bash
   npm run build-sdk  # If changing client code
   npm run build      # Full build
   ```

### Adding New Features to lms-client

1. **Identify the namespace** - llm, embedding, files, plugins, etc.
2. **Update backend interface** in lms-external-backend-interfaces
3. **Implement in lms-client** under appropriate namespace
4. **Add types to lms-shared-types** if needed
5. **Write tests** - Both unit and integration tests
6. **Update documentation** - Add examples and API docs

### Updating Dependencies

1. **Internal dependencies** - Update version in package.json
2. **External dependencies** - Update in root or package package.json
3. **Patches** - If patching npm packages, use patch-package:
   ```bash
   npx patch-package package-name
   ```
4. **Rebuild** after dependency changes:
   ```bash
   npm install
   npm run build
   ```

## Key Files & Locations

### Critical Configuration Files

| File | Purpose |
|------|---------|
| `lerna.json` | Monorepo versioning (independent) |
| `turbo.json` | Build orchestration, caching |
| `tsconfig.build.json` | Root TypeScript project references |
| `jest.config.js` | Test configuration |
| `.eslintrc.json` | Linting rules |
| `.prettierrc.json` | Code formatting |
| `package.json` | Root workspace, scripts, dependencies |

### Key Source Locations

| Path | Contents |
|------|----------|
| `packages/lms-shared-types/src/` | Core type definitions, Zod schemas |
| `packages/lms-communication/src/` | RPC/Channel/Signal foundation |
| `packages/lms-common/src/` | Reactive primitives, utilities |
| `packages/lms-client/src/` | Main SDK implementation |
| `packages/lms-client/src/llm/` | LLM operations, chat, completions |
| `packages/lms-external-backend-interfaces/src/` | Backend API contracts |
| `publish/sdk/` | Published SDK package |
| `scaffolds/` | Project templates |

### Generated Files (Don't Edit)

- `dist/` directories - Generated by TypeScript compiler
- `dist/esm/package.json` - Generated by `scripts/generateEsmPackageJson.mjs`
- `.turbo/` - Turbo cache
- `node_modules/` - Dependencies
- `tsconfig.tsbuildinfo` - TypeScript build cache

## Common Tasks & Commands

### Starting Development

```bash
# Terminal 1 - Watch and rebuild on changes
npm start

# Terminal 2 - Run tests in watch mode (optional)
npm run test-watch
```

### Building for Production

```bash
# Full clean build
npm run build

# Build specific package
npm run build-sdk
npm run build-cli
npm run build-lmstudio
```

### Running Tests

```bash
# Quick test run (excludes heavy tests)
npm test

# All tests including integration
npm test-full

# Watch mode
npm run test-watch

# Sequential (debugging)
npm run test-sequential
```

### Publishing Packages

```bash
# Create production build with CLI binary
npm run make

# Publish to npm (maintainers only)
npm run publish
```

### Common Build Issues

1. **"Cannot find module" errors**
   ```bash
   npm run clean
   npm install
   npm run build
   ```

2. **TypeScript build errors**
   ```bash
   # Clean all build artifacts
   npm run clean

   # Rebuild from scratch
   npm run build
   ```

3. **ESM/CJS issues**
   ```bash
   # Regenerate ESM package.json files
   npm run gen
   ```

4. **Test failures**
   ```bash
   # Run tests sequentially to isolate issues
   npm run test-sequential
   ```

## Things to Avoid

### Don't Do These

1. **Don't edit generated files**
   - Anything in `dist/` directories
   - `dist/esm/package.json` files
   - `.turbo/` cache

2. **Don't use default exports**
   - Use named exports for consistency
   - Makes refactoring easier

3. **Don't bypass type safety**
   - Avoid `any` types when possible
   - Use Zod schemas for runtime validation

4. **Don't create circular dependencies**
   - Follow the dependency hierarchy
   - Lower layers shouldn't import from upper layers

5. **Don't commit without testing**
   - Run `npm test` before committing
   - For significant changes, run `npm test-full`

6. **Don't push directly to main**
   - Always use pull requests
   - Get code review before merging

7. **Don't mix concerns in commits**
   - One logical change per commit
   - Separate refactoring from feature additions

8. **Don't skip documentation**
   - Add TSDoc comments for public APIs
   - Update README when adding features

### Anti-Patterns

1. **Importing from dist/** - Always import from source (`src/`)
2. **Relative imports across packages** - Use package names (`@lmstudio/package-name`)
3. **Skipping type imports** - Use `import { type Foo }` for types
4. **Mutating state directly** - Use Immer for immutable updates
5. **Synchronous operations** - Use async/await for I/O
6. **Inconsistent error handling** - Use custom error types from lms-common

## Tips for AI Assistants

### Before Making Changes

1. **Understand the architecture**
   - Review the dependency hierarchy
   - Identify which packages are affected
   - Check for similar implementations

2. **Read existing code**
   - Use Read tool to examine current implementation
   - Look for patterns and conventions
   - Check tests for usage examples

3. **Plan the changes**
   - Break down into small steps
   - Identify files that need modification
   - Consider backward compatibility

### When Writing Code

1. **Follow conventions**
   - Match existing code style
   - Use inline type imports
   - Add TSDoc comments

2. **Type safety**
   - Define Zod schemas for runtime validation
   - Avoid `any` types
   - Use proper generics

3. **Error handling**
   - Use custom error types
   - Provide helpful error messages
   - Handle edge cases

4. **Testing**
   - Write tests alongside code
   - Test both success and error cases
   - Use snapshot tests for complex outputs

### When Building

1. **Incremental builds**
   - Use `npm start` for watch mode during development
   - Only run full `npm run build` when necessary

2. **Test early and often**
   - Run `npm test` after significant changes
   - Fix test failures immediately

3. **Clean builds for debugging**
   - If seeing weird errors, try `npm run clean && npm run build`

### When Creating Pull Requests

1. **Write clear descriptions**
   - Explain the problem and solution
   - Include code examples if relevant
   - Reference related issues

2. **Keep changes focused**
   - One feature or fix per PR
   - Don't mix refactoring with features

3. **Ensure quality**
   - All tests pass
   - No ESLint errors
   - Code formatted with Prettier

### Understanding the Codebase

#### Key Concepts

1. **Signals** - Observable reactive values (similar to RxJS)
2. **Backend Interfaces** - Type-safe RPC definitions
3. **Handles** - Abstract resource management
4. **Namespaces** - Logical API grouping
5. **Zod Schemas** - Runtime type validation

#### Code Navigation Tips

- **Finding types**: Start in `packages/lms-shared-types/src/`
- **Finding API implementation**: Look in `packages/lms-client/src/`
- **Finding backend contracts**: Check `packages/lms-external-backend-interfaces/src/`
- **Finding utilities**: Look in `packages/lms-common/src/`
- **Finding examples**: Check `scaffolds/` and test files

#### Common Patterns

1. **Creating a Signal**:
   ```typescript
   import { signal } from "@lmstudio/lms-common";
   const mySignal = signal<string>("initial value");
   ```

2. **Defining a Backend Interface**:
   ```typescript
   export const myBackendInterface = createBackendInterface(client => ({
     rpc: {
       myMethod: client.createRpc("myMethod", zodInputSchema, zodOutputSchema),
     },
   }));
   ```

3. **Using Tool Calling**:
   ```typescript
   import { tool } from "@lmstudio/sdk";
   const myTool = tool(zodSchema, async (args, ctx) => {
     // Implementation
   });
   ```

### Troubleshooting

#### Build Issues

- **Module not found**: Run `npm run clean && npm install && npm run build`
- **Type errors**: Check project references in tsconfig files
- **ESM/CJS conflicts**: Regenerate with `npm run gen`

#### Test Issues

- **Tests hanging**: Check for missing async/await
- **Snapshot mismatches**: Review changes, update with `-u` flag if intentional
- **Import errors**: Ensure proper module resolution

#### Runtime Issues

- **WebSocket errors**: Check LM Studio is running (for integration tests)
- **Type validation errors**: Check Zod schema definitions
- **Serialization errors**: Ensure data is SuperJSON-compatible

---

## Quick Reference

### Most Common Commands

```bash
npm start              # Development watch mode
npm test               # Run tests
npm run build          # Full production build
npm run build-sdk      # Build SDK only
npm run clean          # Clean all build artifacts
npm run gen            # Generate ESM package.json
```

### Package Naming Convention

- Internal packages: `@lmstudio/lms-*`
- Published packages: `@lmstudio/sdk`, `@lmstudio/cli`
- All lowercase with hyphens

### Version Management

- Independent versioning per package (Lerna)
- Semantic versioning (semver)
- No automatic git tags

### File Extensions

- `.ts` - TypeScript source
- `.test.ts` - Unit tests
- `.heavy.test.ts` - Integration tests
- `.d.ts` - Type declarations
- `.js` - Compiled JavaScript
- `.mjs` - ES Module JavaScript
- `.cjs` - CommonJS JavaScript

---

## Additional Resources

- **Official Docs**: https://lmstudio.ai/docs/typescript
- **Repository**: https://github.com/lmstudio-ai/lmstudio-js
- **Discord**: https://discord.gg/aPQfnNkxGC (#dev-chat)
- **CONTRIBUTING.md**: See for contribution guidelines
- **README.md**: See for project overview

---

**Last Updated**: 2025-11-17
**Document Version**: 1.0
