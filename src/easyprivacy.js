// EasyPrivacy-derived data is CC BY-SA 3.0; see THIRD-PARTY-NOTICES.txt.
export const SOURCE_URL = 'https://easylist-downloads.adblockplus.org/easyprivacy.txt';
export const CNAME_URL = 'https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers_justdomains.txt';
export const BLOCK_BASE = 20000, ALLOW_BASE = 40000;
const TYPES = {script:'script',image:'image',stylesheet:'stylesheet',xmlhttprequest:'xmlhttprequest',subdocument:'sub_frame',ping:'ping',websocket:'websocket',media:'media',font:'font',object:'object',other:'other'};
const validHost = host => host.length <= 253 && host.includes('.') && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

export function parseEasyPrivacy(text) {
  if (typeof text !== 'string' || text.length > 4_000_000 || !text.startsWith('[Adblock Plus') || !/^! Title: EasyPrivacy\s*$/m.test(text)) throw new Error('The downloaded file is not a supported EasyPrivacy list.');
  const version = text.match(/^! Version: (\d{12})\s*$/m)?.[1];
  if (!version) throw new Error('The list has no valid version.');
  const domains = new Set(), exceptions = [];
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const disabled=new Set();
  for(const line of lines){
    const [pattern,options]=line.split('$');
    if(options?.split(',').includes('badfilter')){
      const remaining=options.split(',').filter(option=>option!=='badfilter').join(',');
      disabled.add(pattern+(remaining?'$'+remaining:''));
    }
  }
  let skipped = 0;
  for (const original of lines) {
    const line = original.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    if(disabled.has(line)||line.split('$')[1]?.split(',').includes('badfilter')){skipped++;continue;}
    if (line.startsWith('@@')) {
      const [pattern, options = ''] = line.slice(2).split('$');
      // This importer only blocks third-party traffic, so first-party exceptions
      // cannot apply. Unsupported third-party exceptions reject the whole update.
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

export function maintainedRules(snapshot, settings, enabled) {
  if (!snapshot || !enabled || !settings.enabled || !settings.trackers) return [];
  const rules=[];
  for (let start=0;start<snapshot.domains.length;start+=100) rules.push({
    id:BLOCK_BASE + start/100, priority:10, action:{type:'block'},
    condition:{requestDomains:snapshot.domains.slice(start,start+100),domainType:'thirdParty',excludedResourceTypes:['main_frame']}
  });
  snapshot.exceptions.forEach((exception,index)=>rules.push({id:ALLOW_BASE+index,priority:15,action:{type:'allow'},condition:exception.condition}));
  return rules;
}

export async function makeSnapshot(text, cnameText = '', fetchedAt=Date.now()) {
  const parsed = parseEasyPrivacy(text);
  if (cnameText) {
    const cnameLines = cnameText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && validHost(l));
    const domainSet = new Set(parsed.domains);
    for (const domain of cnameLines) domainSet.add(domain);
    parsed.domains = [...domainSet].sort();
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text + cnameText));
  return {...parsed, fetchedAt, sha256:Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('')};
}
