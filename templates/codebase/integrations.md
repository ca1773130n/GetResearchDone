# External Integrations Template

Template for `.planning/codebase/INTEGRATIONS.md` - captures external service dependencies.

**Purpose:** Document what external systems this codebase communicates with. Focused on "what lives outside our code that we depend on."

---

## File Template

```markdown
# External Integrations

**Analysis Date:** [YYYY-MM-DD]

## APIs & External Services

**[Service Category]:**
- [Service] - [What it's used for]
  - SDK/Client: [package and version]
  - Auth: [How authenticated]

## Data Storage

**Databases:** [Type/Provider and connection]
**File Storage:** [Service and access]
**Caching:** [Service and connection]

## Authentication & Identity

**Auth Provider:** [Service and implementation]

## Monitoring & Observability

**Error Tracking:** [Service]
**Analytics:** [Service]
**Logs:** [Service]

## CI/CD & Deployment

**Hosting:** [Platform]
**CI Pipeline:** [Service]

## Environment Configuration

**Development:** [Required env vars, secrets location]
**Production:** [Secrets management]

## Webhooks & Callbacks

**Incoming:** [Service and endpoint]
**Outgoing:** [Service and trigger]

---

*Integration audit: [date]*
*Update when adding/removing external services*
```

<guidelines>
Same as GSD integrations template. See GSD codebase/integrations.md for good examples and full guidelines. Security note: Document WHERE secrets live, never WHAT the secrets are.
</guidelines>
