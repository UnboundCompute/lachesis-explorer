# Hosted repository index contract

The hosted builder has two intentionally separate storage projections:

- `cache/<digest>.json` is an opaque, content-addressed build artifact. It is
  reused only when the repository, resolved commit, schema, analyzer, toolchain,
  build options, and timeout all match.
- `repository-index/<host>/<owner>/<repo>/revisions/<sha>.json` is a small
  lookup record for a published revision.
- `repository-index/<host>/<owner>/<repo>/latest.json` points to the most
  recently published `main` or `master` build. Feature branches never move the
  latest pointer.

The API exposes the index through:

```text
GET /api/repos/{owner}/{repo}
GET /api/repos/{host}/{owner}/{repo}?revision=<40-or-64-char-sha>
```

The two-segment form is GitHub shorthand. The host-qualified form supports the
same public GitHub, GitLab, and Bitbucket hosts accepted by repository intake.
The response contains repository identity, resolved revision, build timestamp,
and an opaque `bundle_id` plus `bundle_url`; it does not expose cache keys or
worker details. A missing index returns `404` and means that the repository has
not been built yet.

The worker writes the revision record only after the bundle has been validated
and copied to its opaque delivery key. It updates `latest.json` only for the
default-branch names `main` and `master`. All local tests use mocks; no AWS
credentials or network calls are required to verify this contract.
