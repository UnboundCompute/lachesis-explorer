# Production readiness checklist

This checklist is the release gate for the hosted bundle service. The Explorer itself remains
usable without the hosted service: users can load a local `bundle.json` directly in the browser.

## Before deployment

- [x] Confirm the Explorer production origin is an exact HTTPS origin with no path or wildcard:
  `https://lachesis.unboundcompute.com`.
- [x] Publish the Lachesis wheel to an immutable artifact location. Record its registry-published
  SHA-256; do not use `latest` or a mutable object key.
- [x] Build the worker image with that wheel URL and SHA-256, then push it to regional ECR.
- [x] Resolve the pushed image to a full ECR digest (`repository@sha256:...`).
- [x] Review the Lachesis version, exporter options, and `LACHESIS_CACHE_VERSION` together. Bump
  the cache version whenever any of them changes.
- [ ] Create or select an SNS topic and subscribe the on-call channel before enabling traffic.

## Verify the release candidate

Run these commands from the Explorer repository root:

The commands in this section are split between safe local checks and deployment-gated checks. Do
not run the SAM deployment, hosted API smoke, or repository build smoke from routine local UI work;
those require an explicit release environment and may incur AWS usage.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm audit --audit-level low
PYTHONPATH=services/bundle-service python3 -m unittest discover \
  -s services/bundle-service/tests -v
sam validate --template-file services/bundle-service/template.yaml \
  --region <region> --lint
```

Build and inspect the transformed SAM template before deployment:

```bash
sam build --template-file services/bundle-service/template.yaml
sam validate --template-file .aws-sam/build/template.yaml \
  --region <region> --lint
```

The transformed template must retain the private encrypted bucket, TLS-only bucket policy,
encrypted queues, immutable worker image, worker timeout/queue visibility relationship, event-source
maximum concurrency, log retention, and all four alarms.

## Deploy

Supply the exact values described in `services/bundle-service/README.md`:

```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name lachesis-bundle-service \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ExplorerOrigin=https://lachesis.unboundcompute.com \
    WorkerImageUri=<regional-ecr-uri>@sha256:<digest> \
    AlertTopicArn=<sns-topic-arn> \
  --no-fail-on-empty-changeset
```

Record the deployed `ApiUrl` output and configure `NEXT_PUBLIC_BUNDLE_API_URL` in the Explorer
deployment. Prefer a same-origin reverse proxy when the hosting platform supports one.

## After deployment

- [x] Run the hosted smoke test against the deployed HTTPS API:

  ```bash
  node services/bundle-service/smoke-hosted.mjs https://<api-host> b_<known-id>
  ```

- [x] Submit one small public repository and observe queued → cloning → building → exporting →
  ready in the API and CloudWatch logs.
- [ ] Confirm a repository above 5,000 tracked files terminates as `too_large` before analysis.
- [x] Confirm the returned bundle validates as graph-first schema version 2.
- [x] Confirm the merged Explorer frontend passes the production browser smoke test.
- [ ] Confirm cancellation leaves no published bundle and that a cancelled job is not restarted.
- [ ] Confirm a repeated build uses the private cache while publishing a fresh opaque bundle ID.
- [ ] Confirm malformed IDs, unsupported URLs, oversized requests, and expired jobs return safe
  errors without exposing repository details.
- [ ] Trigger or inspect each alarm and verify delivery to the subscribed on-call channel.
- [ ] Confirm no source content, repository URL, filename, bundle ID, or job ID appears in
  analytics properties.
- [ ] Record the stack version, worker image digest, wheel version, cache version, smoke-test
  result, and alarm destination in the release log.

## Rollback

Rollback by redeploying the previous known-good SAM template and worker image digest. Do not
delete the retained artifact bucket or jobs table during rollback. If an analyzer/exporter change
is involved, bump the cache version before the next forward deployment so stale bundles cannot be
mistaken for current output.

## Current deployment

The hosted stack is deployed in `us-east-1` as `lachesis-bundle-service`.

- API: `https://56h5zgua56.execute-api.us-east-1.amazonaws.com`
- Explorer origin: `https://lachesis.unboundcompute.com`
- Worker: Lachesis `0.5.0`, x86_64 Lambda image
- Worker image digest: `sha256:980d2961ffcfb63956107b236197a8331046ed155f943f076b12f96ed5a7cd4f`
- Wheel SHA-256: `1ebeb5d1b9f19f018141ea6a86a1faf17b2065756363ec83b8a88a43b17ca007`
- Hosted limit: 5,000 tracked files per repository
- Worker memory: 3,008 MiB Lambda quota, with a 2,400 MiB Lachesis process budget
- Queue concurrency: maximum 2 event-source consumers

The backend, real repository smoke path, and merged Explorer frontend are verified. The frontend
production smoke passed after merge commit `075d873`. Before calling the public launch fully
complete, configure `NEXT_PUBLIC_BUNDLE_API_URL` with the API above, add an SNS alarm destination,
and run the remaining cancellation, oversized-repository, cache-hit, and alarm-delivery checks.

The frontend release gate is the browser smoke test against the production origin:

```bash
corepack pnpm exec node scripts/smoke-browser.mjs https://lachesis.unboundcompute.com
```

The production origin currently passes this gate; a successful preview alone is not sufficient for
future releases.
