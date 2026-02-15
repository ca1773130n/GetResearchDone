# User Setup Template

Template for `.planning/phases/XX-name/{phase}-USER-SETUP.md` - human-required configuration that Claude cannot automate.

**Purpose:** Document setup tasks that literally require human action - account creation, dashboard configuration, secret retrieval. Claude automates everything possible; this file captures only what remains.

---

## File Template

```markdown
# Phase {X}: User Setup Required

**Generated:** [YYYY-MM-DD]
**Phase:** {phase-name}
**Status:** Incomplete

Complete these items for the integration to function. Claude automated everything possible; these items require human access to external dashboards/accounts.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `ENV_VAR_NAME` | [Service Dashboard → Path → To → Value] | `.env.local` |

## Account Setup

[Only if new account creation is required]

- [ ] **Create [Service] account**
  - URL: [signup URL]
  - Skip if: Already have account

## Dashboard Configuration

[Only if dashboard configuration is required]

- [ ] **[Configuration task]**
  - Location: [Service Dashboard → Path → To → Setting]
  - Set to: [Required value or configuration]

## Verification

After completing setup, verify with:

```bash
# [Verification commands]
```

---

**Once all items complete:** Mark status as "Complete" at top of file.
```

<guidelines>
Same as GSD user-setup template. See GSD user-setup.md for full schema, frontmatter format, automation-first rule, and service-specific examples (Stripe, Supabase, SendGrid).

**The automation-first rule:** `user_setup` contains ONLY what Claude literally cannot do.

**R&D additions:**
- GPU cloud accounts (Lambda, RunPod, vast.ai) for compute
- Dataset access tokens (HuggingFace, academic portals)
- API keys for model inference services
</guidelines>
