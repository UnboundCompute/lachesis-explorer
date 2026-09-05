# Maintainer guide

Lachesis Explorer is most useful when a repository gives newcomers a stable starting point rather
than a one-off opaque bundle link.

## Add the canonical badge

Replace `ORG` and `REPO` with the public GitHub owner and repository name:

```markdown
[![Understand with Lachesis](https://img.shields.io/badge/understand_with-Lachesis-18c79a?logo=github)](https://lachesis.unboundcompute.com/r/ORG/REPO)
```

Put it near the project description or alongside architecture/documentation links. The canonical
route follows the indexed default branch, shows the resolved commit and build age, and offers a
refresh action. For a release note or an immutable document, pin the commit instead:

```text
https://lachesis.unboundcompute.com/r/ORG/REPO@<40-or-64-character-commit-sha>
```

## What the landing page should contain

The best first impression is a code-understanding projection, not a security finding queue. A
producer should include:

- mapped entrypoints;
- at least one multi-node, source-backed guided path;
- real module/file context and boundary metadata where available;
- a short `meta.description` explaining what the project does;
- honest `coverage.limitations` when the browser receives a projection rather than the full graph.

Security findings can be attached as an overlay, but they should not be the only way to navigate
the codebase.

## Curate a “Start here” tour

Graph-first bundles may include `meta.curated_tour` with a short ordered list of
`flow_id` values and optional `node_id` anchors. Explorer checks those references
against the bundle before rendering the tour, so a stale path is omitted rather
than becoming a broken onboarding link.

Only an authenticated ownership flow or another trusted service boundary may
set `maintainer.verified: true`. Explorer then labels the publisher as verified;
it never infers ownership from a README badge, repository name, or self-asserted
metadata.

## Refresh and revision behavior

The unpinned route resolves the latest indexed `main` or `master` build. A refresh submits the
repository’s accepted URL and ref to the hosted builder; the current graph remains usable while the
new build runs. Revision-pinned routes never move when the default branch changes.

The Explorer repository-index contract is documented in
[`HOSTED_REPOSITORY_INDEX.md`](HOSTED_REPOSITORY_INDEX.md). The current hosted
service does not yet provide the authenticated claim flow; until it does, use
curated tours as exporter metadata without presenting ownership as verified.
