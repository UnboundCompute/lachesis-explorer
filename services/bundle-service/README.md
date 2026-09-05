# Hosted bundle service

This SAM stack accepts a public HTTPS Git repository, runs the Lachesis exporter in a bounded
Lambda container, and serves the resulting `bundle.json` through opaque IDs. Repository URLs are
kept only in short-lived internal job records; they never become object keys, bundle IDs, browser
URLs, analytics properties, or user-facing errors.

## Deployment outline

For the complete release gate, use [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md).

1. Build and push `worker/Dockerfile` with a pinned `LACHESIS_WHEEL_URL`. The image installs `git`,
   Clang, Node, the supported Lachesis toolchains, and runs `worker.handler`.
2. Build/deploy `template.yaml` with SAM, supplying the exact Explorer origin and worker ECR URI.
   Pass `AlertTopicArn` to route API, worker, backlog, and DLQ alarms to an SNS topic.
3. Set `NEXT_PUBLIC_BUNDLE_API_URL` in Explorer to the stack's `ApiUrl` output, or put the API
   behind a same-origin reverse proxy.

Example commands:

```bash
docker build \
  --build-arg LACHESIS_WHEEL_URL=https://files.pythonhosted.org/<immutable-path>/lachesis_cpg-0.5.1-py3-none-manylinux_2_28_x86_64.whl \
  --build-arg LACHESIS_WHEEL_SHA256=<published-sha256> \
  --platform linux/amd64 \
  --provenance=false \
  -f worker/Dockerfile -t <account>.dkr.ecr.<region>.amazonaws.com/lachesis-worker:0.5.1 .
docker push <account>.dkr.ecr.<region>.amazonaws.com/lachesis-worker:0.5.1

sam build --template-file template.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml
```

The stack retains API and worker logs for 30 days and creates four CloudWatch alarms. Alarm
notifications are disabled until `AlertTopicArn` is supplied; configure that topic before launch.
Hosted build submissions are limited to five per source IP per hour using an expiring hashed
DynamoDB bucket; the raw IP address is never stored by the application.
The launch worker rejects repositories above 5,000 tracked files before invoking Lachesis. This
limit is configurable through `MAX_REPOSITORY_FILES`, but should only be raised after an equivalent
Lambda memory, disk, and wall-time benchmark.
Validated bundles are cached privately by a SHA-256 key containing the canonical repository, resolved
commit, schema version, analyzer cache version, toolchain fingerprint, build-options fingerprint, and
build timeout. Bump the relevant value whenever analyzer, exporter, schema, toolchain, or build options
change; cache objects expire with the bucket lifecycle.

The wheel URL must be immutable, its `LACHESIS_WHEEL_SHA256` must match the digest published by the
artifact registry, and its version must match the exporter version used in the cache identity. The
image build also rejects a wheel whose native kernel stamp differs from its Python package version.
Do not use a floating `latest` image or wheel in production.

For repeatable releases, the repository includes a manually triggered
[`deploy-hosted.yml`](../../.github/workflows/deploy-hosted.yml) workflow. Configure the
`AWS_DEPLOY_ROLE_ARN` secret on the repository, protect the `production` environment with required
reviewers, and grant the role only the ECR, CloudFormation/SAM, Lambda, S3, DynamoDB, SQS, Logs,
and SNS actions required by this stack. The workflow resolves the pushed image to a digest before
passing it to SAM; it never deploys the temporary image tag.

`ExplorerOrigin` must be the exact HTTPS origin with no path or wildcard. `WorkerImageUri` must use
the full regional ECR digest form (`...amazonaws.com/repository@sha256:...`); do not deploy a mutable tag.

The worker intentionally caps direct bundle delivery at 5 MiB because API Gateway/Lambda response
limits are lower than the Explorer's general 25 MiB import guard. Larger bundles need a future
opaque CDN delivery endpoint with its own access policy.

### Access and retention policy

Bundle links are bearer links: anyone who possesses an opaque `b_…` ID can read that bundle through
the API. IDs contain no repository information and are generated with high entropy; they are not
an authentication mechanism. Job records expire after one hour, while private S3 bundle objects
expire through the bucket's 30-day lifecycle rule. Use an authenticated gateway or a shorter
lifecycle policy if bundles may contain non-public source code.

The build queue and dead-letter queue use SQS-managed encryption at rest.
The private artifact bucket also denies all non-TLS requests.
The build queue visibility timeout is 5,400 seconds (six times the worker’s 900-second Lambda
timeout), preventing long-running jobs from being delivered twice while still active.

## Local verification

Run the service contract and worker tests from the Explorer repository root:

```bash
PYTHONPATH=services/bundle-service python3 -m unittest discover -s services/bundle-service/tests -v
sam validate --template-file services/bundle-service/template.yaml --region us-east-1 --lint
```

The Python tests use mocks and do not contact AWS. For routine Explorer/UI work, use only the
frontend checks and mocked service tests with hosted API variables unset:

```bash
env -u NEXT_PUBLIC_BUNDLE_API_URL -u BUNDLE_API_URL corepack pnpm run check
PYTHONPATH=services/bundle-service python3 -m unittest discover -s services/bundle-service/tests -q
```

Do not run `sam deploy`, `docker push`, `smoke-hosted.mjs`, or a build request against a deployed
API as part of local testing. The SAM validation and hosted smoke commands below are release-gate
steps and require an explicit deployment decision.

After deployment, run the API smoke test with the stack URL and a known bundle ID:

```bash
node services/bundle-service/smoke-hosted.mjs https://api.example.com b_12345678
```

To exercise the complete hosted lifecycle against a small public repository, pass
`--build-url` (and optionally `--ref`). The command polls to `ready` and validates the returned
graph-first bundle; the repository URL is never printed:

```bash
node services/bundle-service/smoke-hosted.mjs https://api.example.com \
  --build-url https://github.com/UnboundCompute/arachne
```

The deployment workflow exposes the same check through its optional `smoke_repository` input.

The worker runs a dependency-free graph-first contract check immediately before uploading an
artifact. The frontend still performs its full bundle verifier check when loading the artifact.

This is the deployment foundation; production launch still requires AWS quota review, container
image hardening, monitoring/alerts, domain/TLS setup, and an end-to-end deployed smoke test.
The same release path is available as [`scripts/deploy-hosted.sh`](../../scripts/deploy-hosted.sh)
for an authorized deployment environment. It validates the wheel URL and checksum, builds and
pushes a temporary image, resolves its immutable ECR digest, validates SAM, deploys the stack, and
optionally runs the hosted smoke test. It never changes `NEXT_PUBLIC_BUNDLE_API_URL`.

```bash
LACHESIS_VERSION=0.5.1 \
WHEEL_URL=https://files.pythonhosted.org/<immutable-path>/lachesis_cpg-0.5.1-py3-none-manylinux_2_28_x86_64.whl \
WHEEL_SHA256=<published-sha256> \
./scripts/deploy-hosted.sh
```

The script is deployment-only. Do not run it as part of routine local UI checks; those should keep
the hosted API variables unset and use the mocked service tests.
