import {TRACKERS, FINGERPRINTERS, TRACKING_PARAMS, hostnameOf} from './rules.js';
import {listVersion} from './lists.js';

const LIMIT = 500;
const available = Boolean(chrome.declarativeNetRequest.onRuleMatchedDebug);
let state, enabled = true, timer, generation = 0, writeQueue = Promise.resolve();
const ready = (async () => {
  await chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const [session, local] = await Promise.all([
    chrome.storage.session.get('audit'), chrome.storage.local.get('auditEnabled')
  ]);
  enabled = local.auditEnabled !== false;
  state = session.audit || {since: Date.now(), events: []};
})();
ready.catch(console.error);

function persist() {
  clearTimeout(timer); timer = undefined;
  const snapshot = structuredClone(state);
  writeQueue = writeQueue.catch(() => {}).then(() => chrome.storage.session.set({audit: snapshot}));
  return writeQueue;
}

function describe(id) {
  if (id >= 20000 && id < 21000) return {kind:'blocked',reason:'EasyPrivacy tracker domain',rule:`EasyPrivacy ${listVersion()}`};
  if (id >= 1 && id <= TRACKERS.length) return {kind: 'blocked', reason: 'Common tracker', rule: TRACKERS[id - 1]};
  if (id === 500 || id === 501) return {kind: 'blocked', reason: 'Facebook tracking pixel', rule: id === 500 ? 'facebook.com/tr' : 'Facebook fbevents.js'};
  if (id >= 1000 && id < 1000 + FINGERPRINTERS.length) return {kind: 'blocked', reason: 'Known fingerprinting endpoint', rule: FINGERPRINTERS[id - 1000]};
  if (id >= 2000 && id < 2000 + TRACKING_PARAMS.length) return {kind: 'link', reason: 'Link-cleaning rule matched', rule: TRACKING_PARAMS[id - 2000]};
  if (id === 3000) return {kind: 'cookie', reason: 'Cookie-filter rule matched', rule: 'Remove Cookie / Set-Cookie headers'};
  return null; // Site exceptions are not protection events.
}

// Browser-issued events, not counts inferred from configured rules.
// Only hostnames survive this boundary: no paths, queries, or cookie values.
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(info => {
  const detail = describe(info.rule.ruleId);
  if (!detail) return;
  // Tabless traffic has no reliable private-window context; omit it from audit.
  if (info.request.tabId < 0) return;
  const event = {
    timestamp: Date.now(), tabId: info.request.tabId,
    destination: hostnameOf(info.request.url) || '(unavailable)',
    initiator: hostnameOf(info.request.initiator) || '(unavailable)',
    resourceType: info.request.type, ruleId: info.rule.ruleId, ...detail
  };
  const eventGeneration = generation;
  ready.then(async () => {
    if (!enabled) return;
    // Do not keep private-window activity, even if the user allows the extension there.
    if (event.tabId >= 0) {
      try { if ((await chrome.tabs.get(event.tabId)).incognito) return; }
      catch { return; }
    }
    // A clear/pause while the tab lookup was pending must discard the old event.
    if (!enabled || eventGeneration !== generation || event.timestamp < state.since) return;
    state.events.unshift(event);
    state.events.sort((a,b) => b.timestamp - a.timestamp);
    state.events.length = Math.min(state.events.length, LIMIT);
    if (!timer) timer = setTimeout(() => persist().catch(console.error), 150);
  }).catch(console.error);
});

export async function auditMessage(message) {
  await ready;
  if (message.type === 'auditClear') {
    generation++;
    state = {since: Date.now(), events: []};
    await persist();
  } else if (message.type === 'auditToggle') {
    if (typeof message.value !== 'boolean') throw new Error('Invalid recording setting.');
    await chrome.storage.local.set({auditEnabled: message.value});
    enabled = message.value;
    generation++;
    if (!enabled) { state = {since: Date.now(), events: []}; await persist(); }
  }
  return {audit: {...structuredClone(state), enabled, available, limit: LIMIT}};
}
