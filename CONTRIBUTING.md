# Contributing to MoltVision

Thank you for your interest in contributing to MoltVision! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/moltvision.git`
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev`

## Development Workflow

1. Create a branch from `main`: `git checkout -b feature/your-feature`
2. Make your changes
3. Run the linter: `npm run lint`
4. Build to verify: `npm run build`
5. Commit with a clear message describing the change
6. Push to your fork and open a Pull Request

## Project Structure

```
src/
  main/          # Electron main process (Node.js)
  preload/       # Preload script (IPC bridge)
  renderer/src/  # React UI (browser context)
  shared/        # Types shared between main + renderer
```

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- Tailwind CSS with `molt-*` design tokens for styling
- All logging via `electron-log` (never `console.log`)

## IPC Guidelines

- All IPC channels must be namespaced as `domain:action`
- New channels must be added to `src/shared/ipc-channels.ts`
- New invoke channels must be whitelisted in `src/preload/index.ts`
- Never pass plaintext API keys through IPC to the renderer

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- OS and version
- Relevant logs (from `electron-log` output)

## Suggesting Features

Open an issue with the `feature` label describing:
- The problem you want to solve
- Your proposed solution
- Any alternatives you considered

## Pull Request Guidelines

- Keep PRs focused on a single change
- Update documentation if your change affects user-facing behavior
- Add entries to CHANGELOG.md for notable changes
- Ensure `npm run build` passes with zero errors

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
