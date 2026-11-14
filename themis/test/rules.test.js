// The rule module is shared by the Themis page and the Eunomia server.
// The expected ids were captured from the evaluateRisk that app.js held
// before the move (2026-11-14), so a change here is a change in Themis.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../../themis/policy-rules.js');
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'policy.json'), 'utf8'));

test('evaluateRisk returns the same rules as the Themis UI for a teacher state', () => {
  const ev = rules.evaluateRisk({ role: 'teacher', policy: 'not_permitted', assignment: ['essay'] }, policy);
  assert.deepEqual(ev.matches.map(r => r.id), ['R-TEACHER-NOT-PERMITTED']);
  assert.equal(ev.maxRisk, 1);
});

test('evaluateRisk returns the same rules as the Themis UI for a researcher state', () => {
  const ev = rules.evaluateRisk({ role: 'researcher', activity: 'manuscript', target: 'journal', tasks: ['statistics'] }, policy);
  assert.deepEqual(ev.matches.map(r => r.id), ['R-RESEARCHER-AUTHORSHIP', 'R-RESEARCHER-STATISTICS']);
  assert.equal(ev.maxRisk, 2);
});

test('matchesTrigger rejects a policy_any list that lacks the state policy', () => {
  assert.equal(rules.matchesTrigger({ policy_any: ['with_disclosure'] }, { policy: 'not_permitted' }), false);
  assert.equal(rules.matchesTrigger({ policy_any: ['with_disclosure'] }, { policy: 'with_disclosure' }), true);
});

test('matchesTrigger accepts a missing trigger', () => {
  assert.equal(rules.matchesTrigger(undefined, {}), true);
});

test('evaluateRisk returns no matches for a no-use state', () => {
  assert.deepEqual(rules.evaluateRisk({ noUse: true }, policy), { matches: [], maxRisk: 0 });
});

test('evaluateRisk returns no matches when the policy or its rules are missing', () => {
  assert.deepEqual(rules.evaluateRisk({ role: 'teacher' }, null), { matches: [], maxRisk: 0 });
  assert.deepEqual(rules.evaluateRisk({ role: 'teacher' }, {}), { matches: [], maxRisk: 0 });
});
