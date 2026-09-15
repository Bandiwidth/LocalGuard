import {DEFAULTS, normalizeSettings, buildRules, hostnameOf, pausedMatch, TRACKERS} from './rules.js';
import {auditMessage} from './audit.js';
import {initializeLists, listRules, listStatus, changeLists, updateDue, UPDATE_ALARM} from './lists.js';
import {runSelfTest} from './selftest.js';

async function applyContentScripts(settings) {
  try {
    const existingScripts = await chrome.scripting.getRegisteredContentScripts();
    
    // Fingerprinting Script
    const spoofId = 'anti-fingerprint-spoof';
    const isSpoofRegistered = existingScripts.some(s => s.id === spoofId);
    const spoofEnabled = settings.enabled && settings.fingerprinting;
    if (spoofEnabled && !isSpoofRegistered) {
      await chrome.scripting.registerContentScripts([{ id: spoofId, matches: ['<all_urls>'], js: ['spoof.js'], runAt: 'document_start', world: 'MAIN' }]);
    } else if (!spoofEnabled && isSpoofRegistered) {
      await chrome.scripting.unregisterContentScripts({ ids: [spoofId] });
    }

    // Cosmetic Filtering CSS
    const cssId = 'cosmetic-filters';
    const isCssRegistered = existingScripts.some(s => s.id === cssId);
    const cssEnabled = settings.enabled && settings.trackers;
    if (cssEnabled && !isCssRegistered) {
      await chrome.scripting.registerContentScripts([{ id: cssId, matches: ['<all_urls>'], css: ['cosmetic.css'], runAt: 'document_start' }]);
    } else if (!cssEnabled && isCssRegistered) {
      await chrome.scripting.unregisterContentScripts({ ids: [cssId] });
    }

  } catch (e) {
    console.error('Failed to update content scripts:', e);
  }
}

async function applyRules(settings, proposed) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: existing.map(rule => rule.id), addRules: [...buildRules(settings),...listRules(settings,proposed)]});
  await applyContentScripts(settings);
}

async function readSettings() {
  return normalizeSettings((await chrome.storage.local.get('settings')).settings);
}

async function updateBadge(settings) {
  await chrome.action.setBadgeBackgroundColor({color: settings.enabled ? '#28755b' : '#666666'});
  await chrome.action.setBadgeText({text: settings.enabled ? '' : 'OFF'});
  await chrome.action.setTitle({title: settings.enabled ? 'LocalGuard — open to check this site' : 'LocalGuard — paused everywhere'});
}

// Reconcile on each service-worker start. Dynamic rules persist while it sleeps.
// Queue writes so rapid clicks cannot overwrite each other's rule updates.
let queue = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  await initializeLists();
  const settings = await readSettings();
  await applyRules(settings);
  await updateBadge(settings);
})();
queue.catch(console.error);

async function handle(message) {
  if (['auditGet', 'auditClear', 'auditToggle'].includes(message.type)) return auditMessage(message);
  let settings = await readSettings();
  if(message.type==='listState')return {lists:listStatus()};
  if(['listUpdate','listRollback','listSet'].includes(message.type))return {lists:await changeLists(message,settings,applyRules)};
  if(message.type==='selfTest')return {test:await runSelfTest(settings,[...buildRules(settings),...listRules(settings)],listStatus())};
  if (message.type === 'state') {
    // Repair a failed earlier initialization before reporting protection status.
    const actual = await chrome.declarativeNetRequest.getDynamicRules();
    const expected = [...buildRules(settings),...listRules(settings)];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) await applyRules(settings);
    return {settings, ruleCount: expected.length, lists:listStatus()};
  }
  if (message.type === 'set') {
    if (!Object.hasOwn(DEFAULTS, message.key) || message.key === 'pausedSites' || typeof message.value !== 'boolean') throw new Error('Invalid setting.');
    settings[message.key] = message.value;
  } else if (message.type === 'toggleSite') {
    const tab = await chrome.tabs.get(message.tabId);
    const host = hostnameOf(tab.url);
    if (!host || host.includes(':') || /^[0-9.]+$/.test(host)) throw new Error('Site pausing supports named websites. Use the main switch for this page.');
    const match = pausedMatch(host, settings.pausedSites);
    if (match) settings.pausedSites = settings.pausedSites.filter(site => site !== match);
    else {
      if (settings.pausedSites.length >= 200) throw new Error('The 200-site limit is reached. Remove an exception first.');
      settings.pausedSites.push(host);
    }
  } else if (message.type === 'removeSite') {
    settings.pausedSites = settings.pausedSites.filter(site => site !== message.host);
  } else { throw new Error('Unknown action.'); }

  settings = normalizeSettings(settings);
  const previous = await readSettings();
  await applyRules(settings);
  try { await chrome.storage.local.set({settings}); }
  catch (error) { await applyRules(previous); throw error; }
  await updateBadge(settings);
  return {settings, ruleCount: buildRules(settings).length+listRules(settings).length, lists:listStatus()};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  const task = queue.catch(() => {}).then(() => handle(message));
  queue = task;
  task.then(value => respond({ok: true, ...value}), error => respond({ok: false, error: error.message || 'Unable to update protection.'}));
  return true;
});

chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!==UPDATE_ALARM)return;
  queue=queue.catch(()=>{}).then(async()=>{if(updateDue())await handle({type:'listUpdate'});});
  queue.catch(console.error);
});

// Bounce Tracking Protection
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // Only intercept main frame navigation
    
    try {
      const settings = await readSettings();
      if (!settings.enabled || !settings.cleanLinks) return;

      const url = new URL(details.url);
      const host = hostnameOf(details.url);
      
      // Only un-bounce known trackers
      const isTracker = TRACKERS.some(t => host === t || host.endsWith('.' + t));
      if (!isTracker) return;

      const bounceParams = ['url', 'dest', 'redirect', 'out', 'link', 'target'];
      for (const param of bounceParams) {
        if (url.searchParams.has(param)) {
          const destUrl = url.searchParams.get(param);
          if (destUrl && /^https?:\/\//i.test(destUrl)) {
            new URL(destUrl); // Validate URL parsing
            await chrome.tabs.update(details.tabId, { url: destUrl });
            return;
          }
        }
      }
    } catch (e) {}
  });
}
