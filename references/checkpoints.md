<overview>
Plans execute autonomously. Checkpoints formalize interaction points where human verification or decisions are needed.

**Core principle:** Claude automates everything with CLI/API. Checkpoints are for verification and decisions, not manual work.

**Golden rules:**
1. **If Claude can run it, Claude runs it** - Never ask user to execute CLI commands, start servers, or run builds
2. **Claude sets up the verification environment** - Start dev servers, run eval scripts, configure env vars
3. **User only does what requires human judgment** - Visual checks, UX evaluation, research direction decisions
4. **Secrets come from user, automation comes from Claude** - Ask for API keys, then Claude uses them via CLI
</overview>

<checkpoint_types>

<type name="human-verify">
## checkpoint:human-verify (Most Common - 80%)

**When:** Claude completed automated work, human confirms it works correctly.

**Use for:**
- Visual quality assessment (does output image look good?)
- Interactive flows (click through interface, test user flows)
- Functional verification (feature works as expected)
- Qualitative comparison (which result looks better?)
- Training convergence review (loss curves look healthy?)

**Structure:**
```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>[What Claude automated and built/evaluated]</what-built>
  <how-to-verify>
    [Exact steps to test - URLs, commands, expected behavior]
  </how-to-verify>
  <resume-signal>[How to continue - "approved", "yes", or describe issues]</resume-signal>
</task>
```
</type>

<type name="decision">
## checkpoint:decision (15%)

**When:** Human must make choice that affects research/implementation direction.

**Use for:**
- Approach selection (which method from LANDSCAPE.md?)
- Architecture decisions (model architecture choices)
- Resource allocation (how many iterations to allow?)
- Pivot decisions (should we try a different approach?)
- Target adjustment (revise metric targets?)

**Structure:**
```xml
<task type="checkpoint:decision" gate="blocking">
  <decision>[What's being decided]</decision>
  <context>[Why this decision matters, eval results if applicable]</context>
  <options>
    <option id="option-a">
      <name>[Option name]</name>
      <pros>[Benefits]</pros>
      <cons>[Tradeoffs]</cons>
    </option>
    <option id="option-b">
      <name>[Option name]</name>
      <pros>[Benefits]</pros>
      <cons>[Tradeoffs]</cons>
    </option>
  </options>
  <resume-signal>[How to indicate choice]</resume-signal>
</task>
```
</type>

<type name="eval-review">
## checkpoint:eval-review (R&D-specific - 4%)

**When:** Evaluation results are ready and need human review before proceeding.

**Use for:**
- Post-evaluation decision (iterate/continue/pivot)
- Ablation result review
- Baseline comparison assessment
- Quality vs speed tradeoff decisions

**Structure:**
```xml
<task type="checkpoint:decision" gate="blocking">
  <decision>Review evaluation results and decide next action</decision>
  <context>
    [Eval results table with metrics, baselines, targets]
    [Decision matrix from eval plan]
  </context>
  <options>
    <option id="continue">Continue to next phase (targets met)</option>
    <option id="iterate-minor">Minor iteration (targeted fix)</option>
    <option id="iterate-major">Major iteration (re-survey alternatives)</option>
    <option id="pivot">Pivot to different approach</option>
  </options>
  <resume-signal>Select: continue, iterate-minor, iterate-major, or pivot</resume-signal>
</task>
```
</type>

<type name="human-action">
## checkpoint:human-action (1% - Rare)

**When:** Action has NO CLI/API and requires human-only interaction.

**Use ONLY for:**
- **Authentication gates** - Claude tried CLI/API but needs credentials
- Email verification links
- Manual account approvals
- External service setup requiring browser interaction

**Do NOT use for pre-planned manual work:**
- Running evaluation scripts (use Bash tool)
- Downloading datasets (use CLI)
- Creating files (use Write tool)
</type>
</checkpoint_types>

<execution_protocol>

When Claude encounters `type="checkpoint:*"`:

1. **Stop immediately** - do not proceed to next task
2. **Display checkpoint clearly** using the format from @${CLAUDE_PLUGIN_ROOT}/references/ui-brand.md
3. **Wait for user response** - do not hallucinate completion
4. **Verify if possible** - check files, run tests, whatever is specified
5. **Resume execution** - continue to next task only after confirmation

</execution_protocol>

<automation_reference>

**The rule:** If it has CLI/API, Claude does it. Never ask human to perform automatable work.

## R&D-Specific Automation

| Action | Automatable? | Claude does it? |
|--------|--------------|-----------------|
| Run training script | Yes (python) | YES |
| Run evaluation | Yes (python) | YES |
| Download dataset | Yes (wget/curl) | YES |
| Install dependencies | Yes (pip/conda) | YES |
| Start tensorboard | Yes (CLI) | YES |
| Create checkpoint | Yes (code) | YES |
| Compute metrics | Yes (python) | YES |
| Compare baselines | Yes (python) | YES |
| Visually assess output quality | No | NO |
| Decide research direction | No | NO |
| Review training curves | No | NO |
| Evaluate perceptual quality | No | NO |

## Pre-Checkpoint Automation Failures

| Failure | Response |
|---------|----------|
| Eval script fails | Fix error, retry (don't proceed to checkpoint) |
| OOM during training | Reduce batch size, retry |
| Dataset not found | Download or ask user for path |
| Missing dependency | Install via pip/conda, retry |
| GPU not available | Inform user, offer CPU alternative or checkpoint |
| Auth error | Create auth gate checkpoint |

**Never present a checkpoint with broken verification environment.** Fix first, then checkpoint.

</automation_reference>

<writing_guidelines>

**DO:**
- Automate everything with CLI/API before checkpoint
- Be specific: "Compare output_001.png with baseline_001.png"
- Number verification steps
- State expected outcomes: "You should see X"
- Include metric context: "PSNR improved from 28.5 to 30.2 dB"

**DON'T:**
- Ask human to do work Claude can automate
- Assume knowledge: "Run the eval script"
- Skip steps: "Check the results"
- Mix multiple verifications in one checkpoint

</writing_guidelines>
