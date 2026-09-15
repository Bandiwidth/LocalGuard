// Built-in fallback list, supplemented by the optional maintained EasyPrivacy subset.
// Domains refer to tracking endpoints, not an assertion about all vendor services.
export const TRACKERS = Object.freeze([
  'google-analytics.com', 'analytics.google.com', 'doubleclick.net',
  'googleadservices.com', 'googlesyndication.com', 'adservice.google.com',
  'ads.linkedin.com', 'px.ads.linkedin.com', 'analytics.twitter.com',
  'ads-twitter.com', 'ads.pinterest.com', 'ct.pinterest.com',
  'bat.bing.com', 'clarity.ms', 'hotjar.com', 'hotjar.io',
  'mouseflow.com', 'luckyorange.com', 'luckyorange.net', 'fullstory.com',
  'logrocket.io', 'cdn.logrocket.com', 'cdn.lr-ingest.com',
  'api.mixpanel.com', 'api-js.mixpanel.com', 'cdn.mxpnl.com',
  'api.amplitude.com', 'api2.amplitude.com', 'cdn.amplitude.com',
  'api.segment.io', 'cdn.segment.com', 'cdn.segment.io',
  'plausible.io', 'script.crazyegg.com',
  'static.chartbeat.com', 'ping.chartbeat.net', 'scorecardresearch.com',
  'quantserve.com', 'quantcount.com', 'sb.scorecardresearch.com',
  'adsrvr.org', 'adnxs.com', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com',
  'openx.net', 'casalemedia.com', 'smartadserver.com', 'advertising.com',
  'adroll.com', 'd.adroll.com', 'rlcdn.com', 'demdex.net', 'everesttech.net',
  'tapad.com', 'bluekai.com', 'exelator.com', 'mathtag.com',
  'bidswitch.net', 'adform.net', 'contextweb.com', 'sharethrough.com',
  '3lift.com', 'yieldmo.com', 'z.moatads.com', 'pixel.wp.com',
  'stats.wp.com', 'track.hubspot.com', 'track.hubspot.net',
  'js.hs-analytics.net', 'js.hs-scripts.com', 'snap.licdn.com',
  'tr.snapchat.com', 'sc-static.net', 'analytics.tiktok.com'
]);
export const FINGERPRINTERS = Object.freeze(['fpjs.io', 'fpjscdn.net', 'api.fpjs.io', 'cdn.fingerprint.com']);
export const TRACKING_PARAMS = Object.freeze([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
  'ttclid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi'
]);
export const DEFAULTS = Object.freeze({enabled: true, trackers: true, fingerprinting: true, cleanLinks: true, cookieShield: false, pausedSites: []});

export function hostnameOf(input) {
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/, '') : null;
  } catch { return null; }
}

export function normalizeSettings(raw = {}) {
  const result = {...DEFAULTS, pausedSites: []};
  for (const key of ['enabled', 'trackers', 'fingerprinting', 'cleanLinks', 'cookieShield']) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (Array.isArray(raw.pausedSites)) {
    result.pausedSites = [...new Set(raw.pausedSites.filter(host =>
      typeof host === 'string' && host.length <= 253 &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && !host.includes('..')
    ))].slice(0, 200);
  }
  return result;
}

export function pausedMatch(host, sites) {
  return sites.find(site => host === site || host.endsWith('.' + site));
}

export function buildRules(raw) {
  const settings = normalizeSettings(raw);
  if (!settings.enabled) return [];
  const rules = [];
  const block = (domains, offset) => domains.forEach((domain, index) => rules.push({
    id: offset + index, priority: 10, action: {type: 'block'},
    condition: {requestDomains: [domain], domainType: 'thirdParty', excludedResourceTypes: ['main_frame']}
  }));
  if (settings.trackers) {
    block(TRACKERS, 1);
    // Restrict broad social domains to their tracking URL paths.
    rules.push({id: 500, priority: 10, action: {type: 'block'}, condition: {
      urlFilter: '||facebook.com/tr^', domainType: 'thirdParty', excludedResourceTypes: ['main_frame']
    }});
    rules.push({id: 501, priority: 10, action: {type: 'block'}, condition: {
      urlFilter: '||connect.facebook.net/*/fbevents.js', domainType: 'thirdParty', resourceTypes: ['script']
    }});
  }
  if (settings.fingerprinting) block(FINGERPRINTERS, 1000);
  // Keep each regex small enough for Chromium's 2 KB compiled-regex limit.
  if (settings.cleanLinks) TRACKING_PARAMS.forEach((param, index) => rules.push({
    id: 2000 + index, priority: 5,
    action: {type: 'redirect', redirect: {transform: {queryTransform: {removeParams: [...TRACKING_PARAMS]}}}},
    condition: {
      regexFilter: '^https?://[^#]*[?&]' + param + '=',
      isUrlFilterCaseSensitive: true, resourceTypes: ['main_frame'], requestMethods: ['get']
    }
  }));
  if (settings.cookieShield) rules.push({
    id: 3000, priority: 20,
    action: {type: 'modifyHeaders', requestHeaders: [{header: 'cookie', operation: 'remove'}], responseHeaders: [{header: 'set-cookie', operation: 'remove'}]},
    condition: {domainType: 'thirdParty', excludedResourceTypes: ['main_frame']}
  });
  settings.pausedSites.forEach((domain, i) => {
    // A top-level allowAllRequests also covers nested third-party frames.
    rules.push({id: 10000 + i * 2, priority: 100, action: {type: 'allowAllRequests'},
      condition: {requestDomains: [domain], resourceTypes: ['main_frame']}});
    // Covers requests from already-open documents until their next reload.
    rules.push({id: 10001 + i * 2, priority: 100, action: {type: 'allow'},
      condition: {initiatorDomains: [domain], excludedResourceTypes: ['main_frame']}});
  });
  return rules;
}
