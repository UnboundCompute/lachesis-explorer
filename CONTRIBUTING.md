# Contributing

Thanks for helping improve Lachesis Explorer.

## Development

1. Fork or branch from the current default branch.
2. Install dependencies with `corepack pnpm install --frozen-lockfile` (or `npm install` as a
   non-frozen fallback).
3. Start the app with `corepack pnpm dev` (or `npm run dev`).
4. Make focused changes and keep the existing bundle contract intact.
5. Run the checks below before opening a pull request.

```bash
corepack pnpm run check
corepack pnpm run verify:bundles
git diff --check
```

For the browser regression pass, start a production server in one terminal and run the smoke test
in another. Install Chromium once with `corepack pnpm exec playwright install chromium`.

```bash
corepack pnpm start
corepack pnpm test:browser
```

The smoke test covers desktop and mobile overflow, console errors, framework metadata, accidental
analytics loading, lens navigation, graph selection, and source-inspector opening.

## Pull requests

Describe what changed, why it changed, and how it was verified. UI changes should include the affected viewport sizes and interaction states. Data/import changes should include the input fields exercised and confirm that evidence remains sourced from the bundle.

Please avoid committing generated build output or local dependency-lock changes unrelated to the work.
