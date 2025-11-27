# Project Overview

This project is a TypeScript library designed to facilitate event-driven programming by providing a robust event emitter system.
It allows developers to create, manage, and listen to events in a structured manner.
It Utilizes modern TypeScript features to ensure type safety and enhance developer experience.

More features:
- Developer-Focused API: Clean, modern, and functional.
- Wildcards & Priorities: Subscribe to all events and control listener execution order.
- Full TypeScript Support: Leverage strong typing for more reliable code.

# Source Code Structure

- `src/`: Main source directory.
- `lib/`: Build output directory. Never read from or write to this directory directly.
- `docs-assets/`: Old documentation assets (to be migrated). Ignore for now.
- `docs-assets/`: Old documentation assets (to be migrated). Ignore for now.
- `scripts/`: Various build scripts. Ignore for now.

# Development

- **Install:** `npm install`
- **Build:** `npm run build`
- **Run tests:** `npm run test`
- **Check lintings:** `npm run lint`
- **Check formattings:** `npm run format:check`
- **Clean, build and run all tests:** `npm run cbt` This is useful to ensure that everything is in order.

# Documentation Standards

- **Language:** Always use English when creating or updating documentation.
- **Style:** Use simple, clear, and concise sentences. Follow standard technical documentation practices.
- **Goal:** Convey concepts clearly and distinctly. Avoid personal interpretations or ambiguous language.

# Coding Standards

- **Imports:** Whenever a change is made to a JavaScript or TypeScript source file, the imports must be re-sorted.
- Whenever the behavior of the library has been modified or new methods need to be exported as a public API, the changes must be documented in CHANGELOG.md. If necessary, include helpful tips for any migration that may be required.
