import {hostnameOf, pausedMatch, TRACKERS, FINGERPRINTERS} from './rules.js';
const $ = id => document.getElementById(id);
const keys = ['enabled', 'trackers', 'fingerprinting', 'cleanLinks', 'cookieShield'];
let currentTab, settings, lists;
function showMessage(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function lock() { document.querySelectorAll('input,button').forEach(item => item.disabled = true); }
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Protection service did not respond. Reload the extension.');
  settings = response.settings;
  lists = response.lists;
  render();
}
function render() {
  for (const key of keys) { $(key).checked = settings[key]; $(key).disabled = false; }
  const host = hostnameOf(currentTab?.url);
  const paused = host && pausedMatch(host, settings.pausedSites);
  const anyFeature = settings.trackers || settings.fingerprinting || settings.cleanLinks || settings.cookieShield;
  const active = settings.enabled && !paused && anyFeature;
  $('statusTitle').textContent = !settings.enabled ? 'Paused everywhere' : !anyFeature ? 'All features are off' : paused ? 'Paused on this site' : host ? 'Protection is on' : 'Ready for websites';
  document.querySelector('.status-card').classList.toggle('paused', !active);
  $('site').textContent = host || 'Open a regular website to use site controls.';
  $('siteToggle').disabled = !settings.enabled || !host || host.includes(':') || /^[0-9.]+$/.test(host);
  $('siteToggle').textContent = paused ? 'Resume protection on this site' : 'Pause on this site';
  $('coverage').textContent = lists?.enabled ? `${lists.current.domains.toLocaleString()} maintained domains` : `${TRACKERS.length + FINGERPRINTERS.length} built-in domains`;
  $('exceptionCount').textContent = settings.pausedSites.length;
  $('exceptionList').replaceChildren();
  if (!settings.pausedSites.length) {
    const item = document.createElement('li'); item.textContent = 'No sites paused.'; $('exceptionList').append(item);
  }
  for (const host of settings.pausedSites) {
    const item = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
    label.textContent = host; button.textContent = 'Resume'; button.setAttribute('aria-label', `Resume protection on ${host}`);
    button.addEventListener('click', () => change({type: 'removeSite', host}));
    item.append(label, button); $('exceptionList').append(item);
  }
}
async function change(message) {
  lock(); showMessage('Saving…');
  try { await send(message); showMessage('Saved. Reload affected pages to apply fully.'); }
  catch (error) {
    // Re-read actual state instead of leaving optimistic controls on screen.
    try { await send({type: 'state'}); } catch { $('statusTitle').textContent = 'Protection unavailable'; lock(); }
    showMessage(error.message, true);
  }
}
for (const key of keys) $(key).addEventListener('change', event => change({type: 'set', key, value: event.target.checked}));
$('siteToggle').addEventListener('click', () => change({type: 'toggleSite', tabId: currentTab.id}));
try {
  [currentTab] = await chrome.tabs.query({active: true, currentWindow: true});
  await send({type: 'state'});
} catch (error) { $('statusTitle').textContent = 'Protection unavailable'; $('site').textContent = 'Reload the extension from your browser’s Extensions page.'; showMessage(error.message, true); lock(); }

let refreshing = false;
async function refreshActivity() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await chrome.runtime.sendMessage({type: 'auditGet'});
    if (!response?.ok) throw new Error('Activity unavailable');
    const audit = response.audit;
    $('blockedCount').textContent = audit.available && audit.enabled ? audit.events.filter(e => e.tabId === currentTab?.id && e.kind === 'blocked').length : '—';
    $('auditNote').textContent = !audit.available ? 'Activity requires a manually loaded extension.' : !audit.enabled ? 'Activity recording is off. Blocking can still be on.' : 'Real browser events · latest 500 across all tabs this session. Zero can be normal; reload a site to check.';
  } catch { $('blockedCount').textContent = '—'; $('auditNote').textContent = 'Could not read activity. Reload the extension.'; }
  finally { refreshing = false; }
}
await refreshActivity();
setInterval(refreshActivity, 2000);
