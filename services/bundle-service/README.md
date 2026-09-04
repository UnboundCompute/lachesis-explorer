# Hosted bundle service

This SAM stack accepts a public HTTPS Git repository, runs the Lachesis exporter in a bounded
Lambda container, and serves the resulting `bundle.json` through opaque IDs. Repository URLs are
kept only in short-lived internal job records; they never become object keys, bundle IDs, browser
URLs, analytics properties, or user-facing errors.

## Deployment outline

1. Build and push a worker image containing `git`, the supported Lachesis toolchains, and the
   `lachesis` executable. The image must run `src/worker.py` as its Lambda handler.
2. Build/deploy `template.yaml` with SAM, supplying the exact Explorer origin and worker ECR URI.
3. Set `NEXT_PUBLIC_BUNDLE_API_URL` in Explorer to the stack's `ApiUrl` output, or put the API
   behind a same-origin reverse proxy.

The worker intentionally caps direct bundle delivery at 5 MiB because API Gateway/Lambda response
limits are lower than the Explorer's general 25 MiB import guard. Larger bundles need a future
opaque CDN delivery endpoint with its own access policy.

This is the deployment foundation; production launch still requires AWS quota review, container
image hardening, monitoring/alerts, domain/TLS setup, and an end-to-end deployed smoke test.
