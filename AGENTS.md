# Project Overview

`@spearwolf/eventize` is a lightweight, dependency-free TypeScript library for synchronous event-driven programming. It allows objects to be "eventized" (enhanced with event emitter capabilities) and supports features like wildcards, priorities, and full TypeScript type safety.

# Tech Stack

- **Language:** TypeScript (Target: ES2022)
- **Testing:** Jest
- **Linting/Formatting:** ESLint, Prettier
- **Build Tool:** tsup

# Source Code Structure

- **`src/`**: The main source code directory. All development happens here.
    - `index.ts`: The main entry point exporting the public API.
    - `eventize.ts`: Contains the `eventize` function and factory logic.
    - `eventize-api.ts`: Implements the core event API functions (`on`, `off`, `emit`, etc.).
    - `types.ts`: TypeScript type definitions.
    - `*.spec.ts`: Jest test files, located alongside the source files they test.
- **`lib/`**: Build output directory. **DO NOT READ OR WRITE** to this directory.
- **`scripts/`**: Build and maintenance scripts. Generally, you won't need to modify these.
- **`docs-assets/`**: Assets for documentation.

# Development Workflow

1.  **Install Dependencies:** `npm install`
2.  **Build:** `npm run build`
3.  **Test:** `npm run test` (or `npm run watch` for development)
4.  **Lint & Format:** `npm run lint` and `npm run format:check`
5.  **Verify All:** `npm run cbt` (Clean, Build, Test) - Run this before finishing a task to ensure integrity.

# Coding Guidelines

- **Language:** Use TypeScript for all source code.
- **Style:**
    - Follow the existing functional programming style.
    - Use `const` and arrow functions where appropriate.
    - Ensure strict type safety; avoid `any` unless absolutely necessary.
- **Imports:** Keep imports sorted. Re-sort them if you modify a file.
- **Testing:**
    - Every new feature or bug fix **MUST** have a corresponding test case in a `*.spec.ts` file.
    - Ensure all tests pass using `npm run test`.
- **Documentation:**
    - **CHANGELOG:** For every new feature, API change, or significant bug fix, add an entry to `CHANGELOG.md`.
    - **README:** Update `README.md` if the public API or usage patterns change.
    - Use clear, concise English for all documentation.

# Agent Instructions

- **Context:** Start by reading `README.md` to understand the library's purpose and usage.
- **Navigation:** Use `src/` to understand the implementation. `index.ts` is a good starting point to see what is exported.
- **Modification:** When implementing features, modify files in `src/`. **Never** modify files in `lib/`.
- **Verification:** Always run `npm run cbt` after making changes to ensure the build, linting, and tests are all passing.
