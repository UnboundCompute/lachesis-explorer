FROM public.ecr.aws/lambda/python:3.12

# The image is deliberately built outside the SAM stack. Pin the exact Lachesis
# wheel in CI so analyzer and exporter versions are part of the cache identity.
ARG LACHESIS_WHEEL_URL
ARG LACHESIS_WHEEL_SHA256
RUN test -n "$LACHESIS_WHEEL_URL" \
    && test -n "$LACHESIS_WHEEL_SHA256" \
    && dnf install -y git clang nodejs \
    && dnf clean all \
    && rm -rf /var/cache/dnf \
    && pip install --no-cache-dir "${LACHESIS_WHEEL_URL}#sha256=${LACHESIS_WHEEL_SHA256}" \
    && python -c "from lachesis.cache import _version; from lachesis.flow.native_lifetime import kernel_version; assert kernel_version() == _version(), f'native kernel {kernel_version()} != package {_version()}'" \
    && lachesis --version

COPY src/contract.py ${LAMBDA_TASK_ROOT}/contract.py
COPY src/repository_index.py ${LAMBDA_TASK_ROOT}/repository_index.py
COPY src/worker.py ${LAMBDA_TASK_ROOT}/worker.py
COPY src/verify_bundle.py ${LAMBDA_TASK_ROOT}/verify_bundle.py

# The worker is intentionally single-job per invocation; the SAM event source
# sets BatchSize=1 and reserved concurrency limits parallel resource use.
CMD ["worker.handler"]
