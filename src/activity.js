const $ = id => document.getElementById(id);
let audit, busy = false;
const labels = {blocked: 'Blocked request', link: 'Link-cleaning match', cookie: 'Cookie-filter match'};
function render() {
  $('recording').checked = audit.enabled;
  $('recording').disabled = !audit.available;
  for (const [id, kind] of [['blocked','blocked'],['links','link'],['cookies','cookie']]) $(id).textContent = audit.events.filter(event => event.kind === kind).length;
  const events = audit.events.filter(event => $('filter').value === 'all' || event.kind === $('filter').value);
  $('events').replaceChildren();
  for (const event of events) {
    const row = document.createElement('tr');
    const cell = (text, small) => {const td = document.createElement('td'); td.textContent = text; if (small) {const sub = document.createElement('small'); sub.textContent = small; td.append(sub);} row.append(td); return td;};
    cell(new Date(event.timestamp).toLocaleTimeString(), new Date(event.timestamp).toLocaleDateString());
    cell(labels[event.kind], event.reason).className = event.kind;
    cell(event.destination, event.resourceType);
    cell(event.initiator, event.tabId >= 0 ? `Tab ${event.tabId}` : 'Background request');
    cell(`Rule ${event.ruleId}`, event.rule);
    $('events').append(row);
  }
  $('empty').hidden = events.length > 0;
  $('empty').textContent = !audit.enabled ? 'Recording is off. Enable it to see new browser activity. Blocking is controlled separately.' : $('filter').value !== 'all' ? 'No retained events match this filter.' : 'No recorded activity yet. Open or reload a website with protection enabled, then return here. Zero can be normal: the site may not contact a listed tracker.';
  $('export').disabled = !audit.events.length;
  $('status').textContent = !audit.available ? 'Activity is unavailable. This feature requires loading the extension unpacked with Developer mode.' : !audit.enabled ? 'Recording off · retained activity cleared.' : `Live · ${audit.events.length} of ${audit.limit} retained events · since ${new Date(audit.since).toLocaleString()}`;
}
async function request(type = 'auditGet', extra = {}) {
  if (busy) return;
  busy = true;
  $('recording').disabled = true;
  for (const id of ['refresh','clear','export']) $(id).disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({type, ...extra});
    if (!response?.ok) throw new Error(response?.error || 'Activity service unavailable.');
    audit = response.audit; render();
  } catch (error) { $('status').textContent = error.message; }
  finally {
    busy = false; $('refresh').disabled = false; $('clear').disabled = false;
    $('recording').disabled = !audit?.available;
    $('export').disabled = !audit?.events.length;
  }
}
$('refresh').addEventListener('click', () => request());
$('clear').addEventListener('click', () => request('auditClear'));
$('recording').addEventListener('change', event => request('auditToggle', {value: event.target.checked}));
$('filter').addEventListener('change', () => {if (audit) render();});
$('export').addEventListener('click', () => {
  const data = {extension: 'LocalGuard', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), scope: 'Latest 500 browser-reported events this session; domains only. Match counts are not counts of identifiers removed.', recordingEnabled: audit.enabled, since: new Date(audit.since).toISOString(), events: audit.events};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `LocalGuard-audit-${new Date().toISOString().replace(/[:.]/g,'-')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
await request();
setInterval(() => {if (!document.hidden) request();}, 2000);
