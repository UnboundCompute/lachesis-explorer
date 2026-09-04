FROM public.ecr.aws/lambda/python:3.12

# The image is deliberately built outside the SAM stack. Pin the exact Lachesis
# wheel in CI so analyzer and exporter versions are part of the cache identity.
ARG LACHESIS_WHEEL_URL
RUN test -n "$LACHESIS_WHEEL_URL" \
    && dnf install -y git clang nodejs \
    && dnf clean all \
    && rm -rf /var/cache/dnf \
    && pip install --no-cache-dir "$LACHESIS_WHEEL_URL"

COPY src/contract.py ${LAMBDA_TASK_ROOT}/contract.py
COPY src/worker.py ${LAMBDA_TASK_ROOT}/worker.py
COPY src/verify_bundle.py ${LAMBDA_TASK_ROOT}/verify_bundle.py

# The worker is intentionally single-job per invocation; the SAM event source
# sets BatchSize=1 and reserved concurrency limits parallel resource use.
CMD ["worker.handler"]
