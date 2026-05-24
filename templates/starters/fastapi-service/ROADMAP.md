# Roadmap

## v0.1 — contract-first service

- [ ] **Phase 1: OpenAPI contract** — write `openapi.yaml` with
  {{N_ENDPOINTS}} endpoint specs; pydantic models for every request /
  response; CI gate that fails on schema-doc drift
- [ ] **Phase 2: endpoints + happy-path tests** — implement endpoints
  honoring the contract; pytest fixture per endpoint with happy-path
  request/response assertions
- [ ] **Phase 3: error-path coverage** — 4xx / 5xx contract tests; auth
  rejection tests; rate-limit boundary tests

## v0.2 — deploy-readiness

- [ ] **Phase 4: latency benchmarks** — locust / k6 against
  {{ENDPOINT_BENCHMARK}}; p95 < {{LATENCY_TARGET_MS}}ms
- [ ] **Phase 5: deployment manifest** — Dockerfile + docker-compose +
  one cloud target manifest (your choice)
