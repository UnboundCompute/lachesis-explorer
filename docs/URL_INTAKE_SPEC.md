# Bundle intake and hosted artifacts

Status: implementation handoff. This covers the Explorer frontend and a build service backed by
the `lachesis` reader in the `arachne` repository.

## Product goal

Explorer should let a developer understand a complex codebase from a shareable hosted bundle. The
browser must never need to clone a repository or receive a repository URL in its shareable URL.
A build request may contain a repository URL because the user explicitly submitted it to the build
service; that value must not be copied into analytics, browser URLs, bundle IDs, or application
logs.

Intake paths, in priority order:

1. Hosted bundle: Explorer opens `?bundle=<opaque-id>`.
2. Git build: the service clones a public repository, builds the graph, exports `bundle.json`,
   stores the artifacts, and returns an opaque bundle ID.
3. Local fallback: the developer runs Lachesis locally and uploads `bundle.json`.

Shared URLs contain only an unguessable ID, for example:

```text
https://explorer.example.com/?bundle=b_7Jkx92mQ
```

The ID must not encode repository, owner, filename, commit, storage path, or source URL. Bundle
metadata may still contain source locations because that information is required for code
understanding; it must not be sent to analytics.

## End-to-end architecture

```text
Git URL + optional ref
        │
        ▼
Build API ── resolve ref ── cache lookup ── enqueue job
        │                                      │
        │                                      ▼
        │                         Lambda container worker
        │                         clone at SHA
        │                         lachesis build
        │                         lachesis trace → bundle.json
        │                                      │
        ▼                                      ▼
  job status API                       private object storage
        │                              graph + bundle artifacts
        └────────────── returns opaque bundle ID
                                       │
                                       ▼
                            Explorer ?bundle=<opaque-id>
                            resolve → normalize → activate
```

The Explorer may be statically deployed. If so, `/api/build` and bundle resolution must be an
external configured service or a same-origin reverse proxy; a static export cannot provide API
routes by itself. CORS must allow only the deployed Explorer origins.

## Explorer behavior

### Hosted bundle loading

Read `bundle` before the existing `scope=local` branch. Resolve the opaque ID through the build
service, then fetch the returned bundle artifact. The browser URL remains `?bundle=<id>` plus the
normal view-position parameters (`view`, `flow`, `node`, `entry`, and so on).

On success:

- Preserve and restore the pending investigation position.
- Mark the bundle origin as `hosted`, not `demo` or `local`.
- Keep the opaque ID in URL state during navigation.
- Validate JSON, bundle schema, size and supported format before activation.
- Record only a generic event such as `bundle_loaded_hosted` with counts/capabilities, never IDs,
  URLs, repository names, filenames or code.

On failure, keep the current bundle and show an actionable error. Do not silently replace it with
a sample.

The resolution endpoint must validate the ID format, enforce access/link policy, and return an
artifact with a bounded size. If direct artifact fetches are used, the service may issue a
short-lived URL, but that URL must never enter browser history or recent-bundle storage.

The default contract is `GET /api/bundles/{bundle_id}` returning the bundle JSON directly with
`Content-Type: application/json`. This keeps the browser unaware of storage URLs and avoids
redirect-based loading. A separate signed artifact URL is an optional internal optimization, not
part of the Explorer URL contract.

### Git build and polling

Request:

```json
{ "git_url": "https://github.com/GNOME/libxml2", "ref": "master" }
```

Response for a new job:

```json
{ "job_id": "j_…", "status": "queued", "sha": "…" }
```

Response for a cache hit or completed job:

```json
{ "status": "ready", "bundle_id": "b_…", "sha": "…" }
```

Poll `GET /api/build/{job_id}` with backoff and jitter. Honor `Retry-After`, stop polling when
the page is hidden or unmounted, and enforce a client deadline. Use stable statuses:
`queued`, `cloning`, `building`, `exporting`, `ready`, `too_large`, `unsupported_language`,
`error`, and `expired`.

The UI should show clone/build/export progress, preserve the submitted form on failure, and offer
the local fallback for size or language limits.

For v1, accept only canonical public HTTPS repository URLs from an explicit host allowlist. Reject
SSH, credentials, nonstandard protocols, IP literals, private hosts, unsupported refs and malformed
owner/repository paths. Resolve refs to an immutable commit SHA before enqueueing work.

### Local fallback

The current Arachne CLI already supports the combined flow:

```bash
lachesis trace . --out bundle.json
```

The UI should show that command, a copy button, and the existing drag-and-drop/file picker. The
contract link in the deployed app must point to hosted repository documentation, not a local
`docs/...` path.

### Recent bundles

Store metadata only. Hosted entries may store the opaque `bundle_id`, display name, language,
revision, counts and expiry. Never store raw Git URLs, signed artifact URLs, access tokens, or
bundle contents. Expired entries should be removed or shown as unavailable.

## Build service

### API

`POST /api/build` validates the URL, resolves the ref, performs a bounded preflight, checks the
cache, and enqueues a job. It must not return repository details in errors or logs.

`GET /api/build/{job_id}` returns bounded progress information. It must use high-entropy job IDs,
rate limits, quotas, expiration, cancellation, retry/DLQ handling, and an explicit access policy.

### Worker

The Lambda container worker:

1. Clones with hooks disabled, no submodules, bounded depth/size/time, and checks out the resolved
   SHA.
2. Runs the Lachesis graph build with a subprocess timeout below the platform timeout.
3. Runs `lachesis trace <source> --out /tmp/bundle.json` or the final equivalent exporter command.
4. Validates the output with the dependency-free publish-time v2 contract validator before upload.
5. Uploads the exported bundle and optionally the `.kuzu` graph to private storage.
6. Publishes a bundle ID and updates the job to `ready`.

The worker must not run repository package installation, build scripts, hooks, plugins or other
repository-controlled executable configuration. Apply limits to expanded bytes, file count, Git
objects, processes, open files, memory, CPU, wall time, temporary storage and output size. Network
access after cloning must be denied except for explicitly required service endpoints such as S3,
DynamoDB, SQS and logging.

### Storage and cache

Use opaque storage keys. Do not use repository names or paths in public object URLs. The default
bucket is private; access is through bundle resolution or a controlled CDN/API policy. Document
whether links are public-to-anyone-with-the-link, authenticated, signed and expiring, or deletable.

The cache key must include more than the commit:

```text
canonical repository identity + commit SHA + engine + exporter + schema + toolchain + options
```

The same source commit can produce different bundles after an analyzer or exporter upgrade.

## Bundle contract

For the code-understanding experience, the worker must produce graph-first schema 2.0. Arachne
keeps the security-oriented 1.0 export for compatibility, while `lachesis trace` now defaults to
the graph-first export. The 2.0 bundle should include:

- repository, language, revision, line count and indexed-node count;
- explicit `analysis_projection` metadata (`code-understanding` for the
  comprehension-first surface or a security/audit value for witness-first
  bundles);
- graph nodes and edges;
- files, modules and entrypoints where available;
- optional value/request paths and security findings;
- exporter limitations and provenance;
- `meta.source_url_template` using only `{file}`, `{line}`, `{end_line}`, `{revision}`.

Example:

```text
https://github.com/GNOME/libxml2/blob/{revision}/{file}#L{line}-L{end_line}
```

The template must not use `{owner}` or `{repo}` unless the Explorer contract is explicitly extended
to support them.

## Security and privacy gates

Before public launch, verify:

- no repository URL, bundle ID, signed URL, source path or code enters analytics;
- page-view analytics and referrer policy do not expose sensitive query data;
- raw Git URLs and tokens are redacted from application, worker and provider logs;
- build and bundle endpoints enforce size, rate, quota, access and expiration policies;
- arbitrary repository execution is isolated and resource-bounded;
- private storage cannot be read without the intended bundle access path;
- schema validation, malformed input, cancellation, retries and expired IDs are tested;
- a fresh browser can open an opaque share link and restore the intended reading position.

## Delivery order

1. Finalize and test graph-first schema 2.0 output.
2. Implement opaque bundle-ID resolution and hosted loading in Explorer.
3. Verify share links, back/forward navigation and recent-bundle behavior.
4. Deploy the bounded Lambda build service and private artifact storage.
5. Add Git URL intake, polling and progress UX.
6. Add size/language fallback and polish the local CLI handoff.
7. Add a larger Fargate/Batch tier only after the Lambda path is reliable.
