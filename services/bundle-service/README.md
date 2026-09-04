# Hosted bundle service

This SAM stack accepts a public HTTPS Git repository, runs the Lachesis exporter in a bounded
Lambda container, and serves the resulting `bundle.json` through opaque IDs. Repository URLs are
kept only in short-lived internal job records; they never become object keys, bundle IDs, browser
URLs, analytics properties, or user-facing errors.

## Deployment outline

1. Build and push `worker/Dockerfile` with a pinned `LACHESIS_WHEEL_URL`. The image installs `git`,
   Clang, Node, the supported Lachesis toolchains, and runs `worker.handler`.
2. Build/deploy `template.yaml` with SAM, supplying the exact Explorer origin and worker ECR URI.
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

The wheel URL must be immutable and match the exporter version used in the cache identity. Do not
use a floating `latest` image or wheel in production.

The worker intentionally caps direct bundle delivery at 5 MiB because API Gateway/Lambda response
limits are lower than the Explorer's general 25 MiB import guard. Larger bundles need a future
opaque CDN delivery endpoint with its own access policy.

This is the deployment foundation; production launch still requires AWS quota review, container
image hardening, monitoring/alerts, domain/TLS setup, and an end-to-end deployed smoke test.
