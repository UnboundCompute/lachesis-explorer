# Contributing

Thanks for helping improve Lachesis Explorer.

## Development

1. Fork or branch from the current default branch.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Make focused changes and keep the existing bundle contract intact.
5. Run the checks below before opening a pull request.

```bash
npm run check
npm run verify:bundles
git diff --check
```

## Pull requests

Describe what changed, why it changed, and how it was verified. UI changes should include the affected viewport sizes and interaction states. Data/import changes should include the input fields exercised and confirm that evidence remains sourced from the bundle.

Please avoid committing generated build output or local dependency-lock changes unrelated to the work.
