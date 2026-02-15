# Verification Patterns

How to verify different types of artifacts in R&D projects. Extends standard code verification with tiered evaluation and quantitative metric checks.

<core_principle>
**Existence ≠ Implementation ≠ Correctness**

Verification in R&D must check:
1. **Exists** - File is present at expected path
2. **Substantive** - Content is real implementation, not placeholder
3. **Wired** - Connected to the rest of the system
4. **Functional** - Actually works when invoked
5. **Quantitative** - Meets defined performance targets (R&D-specific)

Levels 1-3 can be checked programmatically. Level 4 often requires human verification or test execution. Level 5 requires running evaluation pipelines.
</core_principle>

<tiered_verification>

## Tiered Verification System

R&D phases use tiered verification to balance speed vs rigor.

### Tier 1: Sanity Check
**When:** After every code change, during implementation
**Runtime:** < 1 minute
**What it checks:**
- Code compiles/runs without errors
- Model loads and produces output (not NaN, not zeros)
- Output shape/dimensions are correct
- Basic smoke test on 1-5 samples

**Automated pattern:**
```bash
# Sanity check: model runs and produces non-trivial output
python -c "
import torch
model = load_model('checkpoint.pth')
x = torch.randn(1, 3, 256, 256)
y = model(x)
assert y.shape == (1, 3, 1024, 1024), f'Wrong shape: {y.shape}'
assert not torch.isnan(y).any(), 'NaN in output'
assert y.std() > 0.01, 'Output is near-constant'
print('Sanity check passed')
"
```

**Pass criteria:** Model runs, output shape correct, no NaN/zeros.

### Tier 2: Proxy Evaluation
**When:** After completing plan tasks, during development
**Runtime:** 1-5 minutes
**What it checks:**
- Quantitative metrics on small validation set
- Metrics in expected range (not necessarily at target)
- No regression from baseline
- Reasonable inference speed

**Automated pattern:**
```bash
# Proxy eval: metrics on small set
python eval.py --dataset Set5 --metrics psnr,ssim --output results.json
# Check results against baseline
python -c "
import json
results = json.load(open('results.json'))
baseline = json.load(open('.planning/research/BASELINE.md.json'))
assert results['psnr'] >= baseline['psnr'] - 0.5, 'PSNR regression'
print(f'PSNR: {results[\"psnr\"]:.2f} (baseline: {baseline[\"psnr\"]:.2f})')
"
```

**Pass criteria:** Metrics above baseline minus tolerance, no regression.

### Tier 3: Full Evaluation
**When:** Phase completion, milestone boundaries
**Runtime:** 5-60 minutes
**What it checks:**
- Full metric suite on all evaluation datasets
- Comparison against published baselines
- Ablation studies (for evaluate phases)
- Statistical significance if applicable

**Automated pattern:**
```bash
# Full eval: all datasets, all metrics
python eval.py --dataset all --metrics all --output full_results.json
python compare_baselines.py --results full_results.json --benchmarks .planning/research/BENCHMARKS.md
```

**Pass criteria:** Primary metrics meet targets defined in BENCHMARKS.md.

### Deferred Verification
**When:** Verification cannot be performed now (missing data, hardware, etc.)
**Tracks in:** STATE.md `Pending Validations` section
**Resolves at:** Later phase or milestone boundary

**Recording pattern:**
```markdown
## Pending Validations

| ID | What | Deferred From | Reason | Resolve By |
|----|------|--------------|--------|------------|
| DV-01 | Full eval on Urban100 | Phase 3 | Dataset not yet downloaded | Phase 4 |
| DV-02 | GPU memory profiling | Phase 2 | Need A100 access | Phase 5 |
```

</tiered_verification>

<stub_detection>

## Universal Stub Patterns

These patterns indicate placeholder code regardless of file type:

**Comment-based stubs:**
```bash
grep -E "(TODO|FIXME|XXX|HACK|PLACEHOLDER)" "$file"
grep -E "implement|add later|coming soon|will be" "$file" -i
grep -E "// \.\.\.|/\* \.\.\. \*/|# \.\.\." "$file"
```

**Placeholder values in research code:**
```bash
# Hardcoded metrics or results
grep -E "psnr.*=.*\d+\.\d+|ssim.*=.*0\.\d+" "$file"  # Hardcoded metric values
grep -E "return.*0\.0|return.*-1" "$file"  # Trivial returns
grep -E "pass$|\.\.\.|\bnothing\b" "$file"  # Empty implementations
```

**Dummy model patterns:**
```python
# RED FLAGS - These are stubs:
class Model(nn.Module):
    def forward(self, x):
        return x  # Identity function, not a real model

def train(model, data):
    pass  # No training logic

def evaluate(model, dataset):
    return {"psnr": 30.0, "ssim": 0.9}  # Hardcoded results
```

</stub_detection>

<model_verification>

## Model / Research Code Verification

**Existence check:**
```bash
# Model file exists and defines a model class
[ -f "$model_path" ] && grep -E "class.*\(nn\.Module\)|class.*\(torch\.nn" "$model_path"
```

**Substantive check:**
```bash
# Has forward method with real logic (not identity)
grep -A 20 "def forward" "$model_path" | grep -v "return x$" | grep -E "conv|linear|attention|relu|sigmoid"

# Has trainable parameters
grep -E "nn\.(Conv|Linear|BatchNorm|LayerNorm|MultiheadAttention)" "$model_path"

# More than trivial length
[ $(wc -l < "$model_path") -gt 30 ]
```

**Wiring check:**
```bash
# Model is imported and used in training/eval scripts
grep -r "import.*$(basename "$model_path" .py)" --include="*.py" | grep -v "$model_path"

# Model is instantiated somewhere
grep -r "$(grep -oP 'class (\w+)' "$model_path" | head -1 | awk '{print $2}')\(" --include="*.py"
```

**Quantitative check:**
```bash
# Run sanity check
python -c "
from model import Model
import torch
m = Model()
x = torch.randn(1, 3, 64, 64)
y = m(x)
params = sum(p.numel() for p in m.parameters())
print(f'Output shape: {y.shape}')
print(f'Parameters: {params:,}')
assert params > 100, 'Model has almost no parameters'
"
```

</model_verification>

<training_verification>

## Training Pipeline Verification

**Existence check:**
```bash
[ -f "$train_script" ] && grep -E "def train|optimizer|loss" "$train_script"
```

**Substantive check:**
```bash
# Has optimizer setup
grep -E "optim\.(Adam|SGD|AdamW)" "$train_script"

# Has loss function
grep -E "loss.*=|criterion.*=|F\.(mse|l1|cross_entropy)" "$train_script"

# Has training loop
grep -E "for.*epoch|for.*batch|for.*step" "$train_script"

# Has gradient computation
grep -E "loss\.backward|backward\(\)|grad" "$train_script"
```

**Stub patterns specific to training:**
```python
# RED FLAGS:
for epoch in range(num_epochs):
    pass  # Empty training loop

loss = criterion(output, target)
# loss.backward() missing - no gradient computation

optimizer = torch.optim.Adam(model.parameters())
# optimizer.step() missing - no weight updates
```

</training_verification>

<eval_verification>

## Evaluation Pipeline Verification

**Existence check:**
```bash
[ -f "$eval_script" ] && grep -E "def eval|def test|def validate|metrics" "$eval_script"
```

**Substantive check:**
```bash
# Loads model from checkpoint
grep -E "load_state_dict|torch\.load|load_model" "$eval_script"

# Computes real metrics (not hardcoded)
grep -E "psnr\(|ssim\(|lpips\(|calculate_" "$eval_script"

# Iterates over dataset
grep -E "for.*dataloader|for.*dataset|for.*batch" "$eval_script"

# Aggregates results
grep -E "mean\(\)|average|total.*\/.*count" "$eval_script"
```

**Stub patterns specific to evaluation:**
```python
# RED FLAGS:
def evaluate(model, dataset):
    return {"psnr": 30.0}  # Hardcoded result

# Metric computed but not saved/reported
psnr = calculate_psnr(output, target)
# No: results.append(psnr) or total_psnr += psnr
```

</eval_verification>

<experiment_verification>

## Experiment Result Verification

After evaluation phases, verify results are real and reproducible.

**Result consistency check:**
```bash
# Run evaluation twice, results should be similar (within seed tolerance)
python eval.py --seed 42 --output results_run1.json
python eval.py --seed 42 --output results_run2.json
python -c "
import json
r1 = json.load(open('results_run1.json'))
r2 = json.load(open('results_run2.json'))
for metric in r1:
    diff = abs(r1[metric] - r2[metric])
    assert diff < 0.01, f'{metric} not reproducible: {r1[metric]} vs {r2[metric]}'
print('Results are reproducible')
"
```

**Baseline comparison check:**
```bash
# Verify claimed improvement is real
python -c "
import json
results = json.load(open('results.json'))
baseline = json.load(open('baseline.json'))
for metric in ['psnr', 'ssim']:
    delta = results[metric] - baseline[metric]
    print(f'{metric}: {baseline[metric]:.4f} → {results[metric]:.4f} (delta: {delta:+.4f})')
    if delta < 0:
        print(f'  WARNING: {metric} REGRESSED')
"
```

**Ablation validity check:**
- Each ablation removes exactly ONE component
- Control experiment uses full model
- Results are compared against same baseline
- Statistical significance noted if applicable

</experiment_verification>

<verification_by_phase_type>

## Verification by Phase Type

### Survey Phase
- **Tier 1 only**: LANDSCAPE.md exists and has content
- Check: papers listed, methods categorized, recommendation present
- No quantitative verification needed

### Implement Phase
- **Tier 1 + Tier 2**: Code runs and produces reasonable results
- Check: model trains, metrics are in expected range
- May defer Tier 3 to evaluate phase

### Evaluate Phase
- **All tiers**: Full quantitative verification
- Check: all metrics computed on all datasets, ablations run
- Decision matrix applied to results

### Integrate Phase
- **Tier 2**: Integration works, no regression
- Check: combined system produces expected output
- Previous phase metrics maintained

</verification_by_phase_type>

<verification_checklist>

## Quick Verification Checklist

### Model Code Checklist
- [ ] Model file exists and defines nn.Module subclass
- [ ] Forward method has real operations (not identity)
- [ ] Has trainable parameters (conv, linear, etc.)
- [ ] Produces correct output shape
- [ ] No NaN or constant outputs
- [ ] Imported and used in train/eval scripts

### Training Pipeline Checklist
- [ ] Optimizer defined and steps called
- [ ] Loss function computed and backward called
- [ ] Data loading works (not empty batches)
- [ ] Checkpoint saving implemented
- [ ] Loss decreases over iterations (sanity)

### Evaluation Pipeline Checklist
- [ ] Loads model from checkpoint
- [ ] Computes real metrics (not hardcoded)
- [ ] Iterates over full dataset
- [ ] Results saved/reported
- [ ] Reproducible with same seed

### Experiment Results Checklist
- [ ] Metrics computed on standard datasets
- [ ] Baseline comparison included
- [ ] Delta from baseline is positive (or explained)
- [ ] Results recorded in BENCHMARKS.md
- [ ] Reproduction command documented

### Wiring Checklist
- [ ] Model → Training: model used in training loop
- [ ] Training → Checkpoint: weights saved to disk
- [ ] Checkpoint → Eval: weights loaded for evaluation
- [ ] Eval → Results: metrics written to output file
- [ ] Results → BENCHMARKS.md: values recorded

</verification_checklist>

<human_verification_triggers>

## When to Require Human Verification

**Always human (R&D-specific):**
- Visual quality assessment (does the output look good?)
- Qualitative comparison (which method produces better results?)
- Research direction decisions (should we pivot?)
- Hardware/resource approval (need GPU cluster access)
- External service setup (dataset downloads, API keys)

**Human if uncertain:**
- Whether metric improvement is perceptually meaningful
- Whether training is converging normally
- Whether failure is implementation bug vs fundamental limitation
- Edge case quality assessment

**Format for human verification request:**
```markdown
## Human Verification Required

### 1. Visual quality check
**Test:** Compare output images from baseline vs new method
**Expected:** Sharper edges, fewer artifacts
**Check:** Are improvements visible to human eye?

### 2. Training convergence
**Test:** Review loss curves in tensorboard
**Expected:** Smooth decrease, no sudden jumps
**Check:** Does training look healthy?
```

</human_verification_triggers>

<checkpoint_automation_reference>

## Pre-Checkpoint Automation

For automation-first checkpoint patterns, server lifecycle management, and error recovery protocols, see:

**@${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md** → `<automation_reference>` section

Key principles:
- Claude sets up verification environment BEFORE presenting checkpoints
- Users never run CLI commands (visit URLs only)
- Server lifecycle: start before checkpoint, handle port conflicts, keep running for duration
- Error handling: fix broken environment before checkpoint, never present checkpoint with failed setup

</checkpoint_automation_reference>
