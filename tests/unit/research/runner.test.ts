'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseMetricsLine, classifyRunFailure, createSubprocessRunner } =
  require('../../../lib/research/runner');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-runner-')); }
const plan = (over = {}) => ({
  procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8,
  predictedOutcome: 'x', scriptPath: 'run.sh', language: 'shell', ...over,
});

describe('runner', () => {
  it('parseMetricsLine extracts __RESULT__ json', () => {
    expect(parseMetricsLine('noise\n__RESULT__ {"accuracy": 0.9}\n')).toEqual({ accuracy: 0.9 });
    expect(parseMetricsLine('no result here')).toEqual({});
  });
  it('classifyRunFailure maps stderr to H2/H3/H4', () => {
    expect(classifyRunFailure('command not found: foo', false)).toBe('H2');
    expect(classifyRunFailure('No such file or directory', false)).toBe('H3');
    expect(classifyRunFailure('anything', true)).toBe('H4');
    expect(classifyRunFailure('', false)).toBe('none');
  });
  it('subprocess runner runs a shell script and captures metrics', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'run.sh'), 'echo "__RESULT__ {\\"accuracy\\": 0.95}"');
    const res = createSubprocessRunner().run(plan(), dir);
    expect(res.exitCode).toBe(0);
    expect(res.metrics.accuracy).toBe(0.95);
    expect(res.failureClass).toBe('none');
  });
  it('subprocess runner classifies a failing script', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'run.sh'), 'cat /no/such/file');
    const res = createSubprocessRunner().run(plan(), dir);
    expect(res.exitCode).not.toBe(0);
    expect(res.failureClass).toBe('H3');
  });

  it('parseMetricsLine returns {} on invalid JSON', () => {
    expect(parseMetricsLine('__RESULT__ {invalid json}')).toEqual({});
  });

  it('classifyRunFailure returns H4 for generic stderr', () => {
    expect(classifyRunFailure('some unknown error', false)).toBe('H4');
  });

  it('subprocess runner uses python3 for python language', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'run.py'), 'print("__RESULT__ {\\"accuracy\\": 0.5}")');
    const res = createSubprocessRunner().run(plan({ language: 'python', scriptPath: 'run.py' }), dir);
    expect(res.exitCode).toBe(0);
    expect(res.metrics.accuracy).toBe(0.5);
  });
});
