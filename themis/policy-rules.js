/*
 * Themis rule evaluation, shared by the Themis page and the Eunomia server.
 *
 * Browser: sets window.THEMIS_RULES. Node: module.exports is the same object.
 * Keeping one copy means the page and the server cannot disagree about which
 * policy.json rules a state triggers. No dependencies, no build step.
 */

(function () {
  'use strict';

  function matchesTrigger(trigger, s) {
    if (!trigger) return true;
    if (trigger.role && trigger.role !== s.role) return false;
    if (trigger.submission && trigger.submission !== s.submission) return false;
    if (trigger.modification && trigger.modification !== s.modification) return false;
    if (trigger.policy && trigger.policy !== s.policy) return false;
    if (trigger.policy_any && trigger.policy_any.indexOf(s.policy) === -1) return false;
    if (trigger.level && trigger.level !== s.level) return false;
    if (trigger.activity && trigger.activity !== s.activity) return false;
    if (trigger.target && trigger.target !== s.target) return false;
    if (trigger.assignment_any) {
      const aList = Array.isArray(s.assignment) ? s.assignment : (s.assignment ? [s.assignment] : []);
      const hit = trigger.assignment_any.some((a) => aList.indexOf(a) !== -1);
      if (!hit) return false;
    }
    if (trigger.activity_any && trigger.activity_any.indexOf(s.activity) === -1) return false;
    if (trigger.target_any && trigger.target_any.indexOf(s.target) === -1) return false;
    if (trigger.tasks_any) {
      const taskList = s.tasks || [];
      const hit = trigger.tasks_any.some((t) => taskList.indexOf(t) !== -1);
      if (!hit) return false;
    }
    if (trigger.riskFlags_any && !trigger.riskFlags_any.some(k => (s.riskFlags || []).includes(k))) return false;
    if (trigger.tools_regex) {
      const tools = (s.tools || '').toString();
      if (!tools) return false;
      try {
        const re = new RegExp(trigger.tools_regex, 'i');
        if (!re.test(tools)) return false;
      } catch (_e) { return false; }
    }
    return true;
  }

  function evaluateRisk(s, policy) {
    if (s.noUse || !policy || !policy.rules) return { matches: [], maxRisk: 0 };
    const matches = [];
    policy.rules.forEach((rule) => {
      if (matchesTrigger(rule.trigger, s)) matches.push(rule);
    });
    const maxRisk = matches.reduce((m, r) => Math.max(m, r.risk || 0), 0);
    return { matches: matches, maxRisk: maxRisk };
  }

  const api = { matchesTrigger: matchesTrigger, evaluateRisk: evaluateRisk };

  // The page has no `module`; Node has no `window`. globalThis is window in a browser.
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.THEMIS_RULES = api;
})();
