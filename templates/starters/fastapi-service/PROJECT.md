# {{PROJECT_NAME}}

**Project shape:** Schema-first FastAPI web service with OpenAPI contract
**Template:** `fastapi-service` from GRD starters

## Goal

Ship a FastAPI service exposing {{N_ENDPOINTS}} endpoints over {{DOMAIN}},
with an OpenAPI 3.1 contract that round-trips through pytest contract
tests and a published Postman / Insomnia collection.

## Concepts (ontology)

endpoint · OpenAPI schema · request/response model · pydantic · pytest
fixture · auth middleware · contract test · deployment manifest

## Targets

- **Primary:** all {{N_ENDPOINTS}} endpoints pass contract tests with
  100% schema coverage
- **Secondary:** p95 response time < {{LATENCY_TARGET_MS}}ms on
  {{ENDPOINT_BENCHMARK}}
- **Constraint:** zero runtime dependencies on services this project
  does not own
