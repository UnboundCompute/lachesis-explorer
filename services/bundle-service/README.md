# Hosted bundle service

This SAM stack accepts a public HTTPS Git repository, runs the Lachesis exporter in a bounded
Lambda container, and serves the resulting `bundle.json` through opaque IDs. Repository URLs are
kept only in short-lived internal job records; they never become object keys, bundle IDs, browser
URLs, analytics properties, or user-facing errors.

## Deployment outline

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

The wheel URL must be immutable and match the exporter version used in the cache identity. Do not
use a floating `latest` image or wheel in production.

`ExplorerOrigin` must be the exact HTTPS origin with no path or wildcard. Supply an immutable
image digest or otherwise deployment-pinned `WorkerImageUri`; do not deploy a mutable tag.

The worker intentionally caps direct bundle delivery at 5 MiB because API Gateway/Lambda response
limits are lower than the Explorer's general 25 MiB import guard. Larger bundles need a future
opaque CDN delivery endpoint with its own access policy.

## Local verification

Run the service contract and worker tests from the Explorer repository root:

```bash
PYTHONPATH=services/bundle-service python3 -m unittest discover -s services/bundle-service/tests -v
sam validate --template-file services/bundle-service/template.yaml --region us-east-1 --lint
```

The worker runs a dependency-free graph-first contract check immediately before uploading an
artifact. The frontend still performs its full bundle verifier check when loading the artifact.

This is the deployment foundation; production launch still requires AWS quota review, container
image hardening, monitoring/alerts, domain/TLS setup, and an end-to-end deployed smoke test.
