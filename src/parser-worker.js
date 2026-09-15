// parser-worker.js
// This Web Worker runs in the background to fetch, parse, and deduplicate
// large text lists off the main Service Worker thread.

const TYPES = {script:'script',image:'image',stylesheet:'stylesheet',xmlhttprequest:'xmlhttprequest',subdocument:'sub_frame',ping:'ping',websocket:'websocket',media:'media',font:'font',object:'object',other:'other'};
const validHost = host => host.length <= 253 && host.includes('.') && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

async function fetchText(url) {
  const response = await fetch(url, {credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read(); if(done) break;
    total += value.length;
    if (total > 15_000_000) { await reader.cancel(); throw new Error('List download exceeded size limit.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

function parseMalwareHosts(text, domainSet) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const host = parts[1].toLowerCase();
      if (validHost(host) && host !== 'localhost' && host !== 'broadcasthost' && !host.includes('localdomain')) {
        domainSet.add(host);
      }
    }
  }
}

export async function processMalware(urlhausUrl, stevenBlackUrl) {
  const [urlhausText, stevenBlackText] = await Promise.all([
    fetchText(urlhausUrl).catch(() => ''),
    fetchText(stevenBlackUrl).catch(() => '')
  ]);
  
  if (!urlhausText && !stevenBlackText) throw new Error('Failed to download both lists.');

  const domains = new Set();
  parseMalwareHosts(urlhausText, domains);
  parseMalwareHosts(stevenBlackText, domains);

  const domainArray = [...domains].sort();
  if (domainArray.length < 1000) throw new Error('Downloaded lists contained too few domains. Aborting.');

  const textToHash = urlhausText + stevenBlackText;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(textToHash));
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

  return { domains: domainArray, fetchedAt: Date.now(), sha256 };
}

function parseEasyPrivacy(text) {
  if (typeof text !== 'string' || text.length > 4_000_000 || !text.startsWith('[Adblock Plus') || !/^! Title: EasyPrivacy\s*$/m.test(text)) throw new Error('The downloaded file is not a supported EasyPrivacy list.');
  const version = text.match(/^! Version: (\d{12})\s*$/m)?.[1];
  if (!version) throw new Error('The list has no valid version.');
  const domains = new Set(), exceptions = [];
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const disabled = new Set();
  for(const line of lines){
    const [pattern,options] = line.split('$');
    if(options?.split(',').includes('badfilter')){
      const remaining = options.split(',').filter(option => option !== 'badfilter').join(',');
      disabled.add(pattern + (remaining ? '$' + remaining : ''));
    }
  }
  let skipped = 0;
  for (const original of lines) {
    const line = original.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    if(disabled.has(line) || line.split('$')[1]?.split(',').includes('badfilter')) {skipped++;continue;}
    if (line.startsWith('@@')) {
      const [pattern, options = ''] = line.slice(2).split('$');
      if (options.split(',').includes('~third-party')) continue;
      if (!pattern || pattern.startsWith('/') && pattern.endsWith('/') || pattern.length > 2000 || pattern.includes('#')) throw new Error('Unsupported list exception; keeping the previous list.');
      const condition = {urlFilter: pattern, domainType:'thirdParty', excludedResourceTypes:['main_frame']};
      const positiveTypes = [], negativeTypes = [];
      for (const option of options.split(',').filter(Boolean)) {
        if (option === 'third-party') continue;
        if (option === 'match-case') {condition.isUrlFilterCaseSensitive = true; continue;}
        if (option.startsWith('domain=')) {
          const include=[],exclude=[];
          for (const token of option.slice(7).split('|')) {
            const host = token.replace(/^~/,'').toLowerCase();
            if (!validHost(host)) throw new Error('Unsupported exception domain; keeping the previous list.');
            (token.startsWith('~') ? exclude : include).push(host);
          }
          if (include.length) condition.initiatorDomains=include;
          if (exclude.length) condition.excludedInitiatorDomains=exclude;
        } else {
          const type = TYPES[option.replace(/^~/,'')];
          if (!type) throw new Error('Unsupported list exception option; keeping the previous list.');
          (option.startsWith('~') ? negativeTypes : positiveTypes).push(type);
        }
      }
      if (positiveTypes.length) {
        condition.resourceTypes = [...new Set(positiveTypes.filter(type=>!negativeTypes.includes(type)))];
        delete condition.excludedResourceTypes;
        if (!condition.resourceTypes.length) continue;
      } else condition.excludedResourceTypes.push(...negativeTypes);
      exceptions.push({condition, source:line});
      continue;
    }
    const match = line.match(/^\|\|([a-z0-9.-]+)\^(?:\$(third-party))?$/);
    if (match && validHost(match[1])) domains.add(match[1]);
    else skipped++;
  }
  if (domains.size < 1000 || domains.size > 100000 || exceptions.length > 5000) throw new Error('Unexpected list size; keeping the previous list.');
  return {version, domains:[...domains].sort(), exceptions, skipped};
}

export async function processLists(sourceUrl, cnameUrl) {
  const epText = await fetchText(sourceUrl);
  const cnameText = await fetchText(cnameUrl).catch(() => ''); // Fallback to empty if CNAME fails
  
  const parsed = parseEasyPrivacy(epText);
  if (cnameText) {
    const cnameLines = cnameText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && validHost(l));
    const domainSet = new Set(parsed.domains);
    for (const domain of cnameLines) domainSet.add(domain);
    parsed.domains = [...domainSet].sort();
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(epText + cnameText));
  
  const fetchedAt = Date.now();
  const sha256 = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
  
  return {...parsed, fetchedAt, sha256};
}

const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined';
if (!isServiceWorker && typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = async (e) => {
    try {
      if (e.data.type === 'parseMalware') {
        const result = await processMalware(e.data.urlhausUrl, e.data.stevenBlackUrl);
        self.postMessage({ id: e.data.id, result });
      } else if (e.data.type === 'parseLists') {
        const result = await processLists(e.data.sourceUrl, e.data.cnameUrl);
        self.postMessage({ id: e.data.id, result });
      }
    } catch (error) {
      self.postMessage({ id: e.data.id, error: error.message });
    }
  };
}
