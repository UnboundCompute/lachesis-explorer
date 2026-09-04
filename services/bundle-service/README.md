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
  --build-arg LACHESIS_WHEEL_URL=https://artifacts.example.com/lachesis_cpg-0.4.2-py3-none-any.whl \
  -f worker/Dockerfile -t <account>.dkr.ecr.<region>.amazonaws.com/lachesis-worker:0.4.2 .
docker push <account>.dkr.ecr.<region>.amazonaws.com/lachesis-worker:0.4.2

sam build --template-file template.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml
```

The stack retains API and worker logs for 30 days and creates four CloudWatch alarms. Alarm
notifications are disabled until `AlertTopicArn` is supplied; configure that topic before launch.
Hosted build submissions are limited to five per source IP per hour using an expiring hashed
DynamoDB bucket; the raw IP address is never stored by the application.
Validated bundles are cached privately by a SHA-256 key containing the canonical repository, resolved
commit, build timeout, and `LACHESIS_CACHE_VERSION`. Bump that version whenever analyzer, exporter,
toolchain, or relevant options change; cache objects expire with the bucket lifecycle.

The wheel URL must be immutable and match the exporter version used in the cache identity. Do not
use a floating `latest` image or wheel in production.

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

After deployment, run the API smoke test with the stack URL and a known bundle ID:

```bash
node services/bundle-service/smoke-hosted.mjs https://api.example.com b_12345678
```

The worker runs a dependency-free graph-first contract check immediately before uploading an
artifact. The frontend still performs its full bundle verifier check when loading the artifact.

This is the deployment foundation; production launch still requires AWS quota review, container
image hardening, monitoring/alerts, domain/TLS setup, and an end-to-end deployed smoke test.
