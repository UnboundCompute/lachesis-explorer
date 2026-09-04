# Production readiness checklist

This checklist is the release gate for the hosted bundle service. The Explorer itself remains
usable without the hosted service: users can load a local `bundle.json` directly in the browser.

## Before deployment

- [ ] Confirm the Explorer production origin is an exact HTTPS origin with no path or wildcard.
- [ ] Publish the Lachesis wheel to an immutable artifact location. Do not use `latest` or a
  mutable object key.
- [ ] Build the worker image with that wheel URL and push it to regional ECR.
- [ ] Resolve the pushed image to a full ECR digest (`repository@sha256:...`).
- [ ] Review the Lachesis version, exporter options, and `LACHESIS_CACHE_VERSION` together. Bump
  the cache version whenever any of them changes.
- [ ] Create or select an SNS topic and subscribe the on-call channel before enabling traffic.

## Verify the release candidate

Run these commands from the Explorer repository root:

```bash
corepack pnpm install --frozen-lockfile
npm run check
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
encrypted queues, immutable worker image, worker timeout/queue visibility relationship, reserved
worker concurrency, log retention, and all four alarms.

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

- [ ] Run the hosted smoke test against the deployed HTTPS API:

  ```bash
  node services/bundle-service/smoke-hosted.mjs https://<api-host> b_<known-id>
  ```

- [ ] Submit one small public repository and observe queued → cloning → building → exporting →
  ready in the API and CloudWatch logs.
- [ ] Confirm a repository above 5,000 tracked files terminates as `too_large` before analysis.
- [ ] Confirm the returned bundle validates as graph-first schema version 2.
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

## Current boundary

The repository can prove static correctness and local contract behavior. A production launch is
not complete until the post-deployment checklist has been executed with AWS credentials and a
published worker image.
