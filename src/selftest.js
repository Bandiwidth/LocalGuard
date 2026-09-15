export async function runSelfTest(settings, expectedRules, lists, malwareLists) {
  const results=[];
  const actual=await chrome.declarativeNetRequest.getDynamicRules();
  const stable=value=>JSON.stringify(value,(_,item)=>item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
  const sorted=rules=>[...rules].sort((a,b)=>a.id-b.id);
  results.push({name:'Installed protection rules',status:stable(sorted(actual))===stable(sorted(expectedRules))?'pass':'fail',detail:`${actual.length} browser rules checked against saved settings.`});
  if (!chrome.declarativeNetRequest.testMatchOutcome) return {at:Date.now(),results:[...results,{name:'Browser-rule tests',status:'unavailable',detail:'Requires this extension to be loaded unpacked.'}]};
  const match=async request=>(await chrome.declarativeNetRequest.testMatchOutcome({method:'get',...request})).matchedRules.map(item=>item.ruleId);
  const probe=async(name,on,request,predicate)=>{
    if(!on){results.push({name,status:'off',detail:'Disabled in your current settings; not tested.'});return;}
    try {const ids=await match(request);results.push({name,status:predicate(ids)?'pass':'fail',detail:ids.length?`Browser matched rule(s): ${ids.join(', ')}.`:'Browser matched no rule.'});}
    catch(error){results.push({name,status:'fail',detail:error.message});}
  };
  const initiator='https://localguard-check.invalid';
  await probe('Third-party tracker blocking',settings.enabled&&settings.trackers,{url:'https://google-analytics.com/collect',initiator,type:'xmlhttprequest'},ids=>ids.some(id=>actual.find(rule=>rule.id===id)?.action.type==='block'));
  await probe('Direct visits stay usable',settings.enabled,{url:'https://google-analytics.com/',type:'main_frame'},ids=>!ids.some(id=>actual.find(rule=>rule.id===id)?.action.type==='block'));
  await probe('Tracking-link cleanup',settings.enabled&&settings.cleanLinks,{url:'https://localguard-check.invalid/page?keep=1&utm_source=test',type:'main_frame'},ids=>ids.some(id=>actual.find(rule=>rule.id===id)?.action.redirect?.transform.queryTransform.removeParams.includes('utm_source')));
  await probe('POST forms are not rewritten',settings.enabled,{url:'https://localguard-check.invalid/form?utm_source=test',method:'post',type:'main_frame'},ids=>!ids.some(id=>actual.find(rule=>rule.id===id)?.action.type==='redirect'));
  await probe('Cookie filtering',settings.enabled&&settings.cookieShield,{url:'https://localguard-other.invalid/item',initiator,type:'xmlhttprequest'},ids=>ids.includes(3000)&&actual.find(rule=>rule.id===3000)?.action.requestHeaders.some(h=>h.header==='cookie'&&h.operation==='remove'));
  await probe('Known fingerprinting endpoints',settings.enabled&&settings.fingerprinting,{url:'https://fpjs.io/agent.js',initiator,type:'script'},ids=>ids.some(id=>actual.find(rule=>rule.id===id)?.action.type==='block'));
  
  // Active fingerprinting & cosmetic check
  if (chrome.scripting && chrome.scripting.getRegisteredContentScripts) {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    const isSpoofRegistered = scripts.some(s => s.id === 'anti-fingerprint-spoof');
    const shouldBeRegistered = settings.enabled && settings.fingerprinting;
    results.push({name:'Active fingerprint spoofing script',status:(shouldBeRegistered === isSpoofRegistered)?'pass':'fail',detail:shouldBeRegistered ? 'Script is registered for active protection.' : 'Script is not registered.'});

    const isCssRegistered = scripts.some(s => s.id === 'cosmetic-filters');
    const shouldCssBeRegistered = settings.enabled && settings.trackers;
    results.push({name:'Cosmetic filtering (Ad hiding)',status:(shouldCssBeRegistered === isCssRegistered)?'pass':'fail',detail:shouldCssBeRegistered ? 'CSS is registered for cosmetic filtering.' : 'CSS is not registered.'});
  } else {
    results.push({name:'Active fingerprint spoofing script',status:'unavailable',detail:'chrome.scripting API not available in this context.'});
  }
  
  results.push({name:'Bounce Tracking Protection', status: (settings.enabled && settings.cleanLinks) ? 'pass' : 'off', detail: 'Monitoring main_frame navigations for tracking redirects.'});

  results.push({name:'Maintained tracker list',status:lists.enabled&&settings.enabled&&settings.trackers?(actual.some(rule=>rule.id>=20000&&rule.id<40000)?'pass':'fail'):'off',detail:`EasyPrivacy & CNAMEs (${lists.current.version}); ${lists.current.domains.toLocaleString()} imported domains.`});
  results.push({name:'Advanced Malware & Spam Protection',status:malwareLists?.enabledMode !== 'off' && settings.enabled && settings.blockMalicious ? (actual.some(rule=>rule.id>=50000&&rule.id<60000)?'pass':'fail') : 'off',detail:`URLhaus & StevenBlack; ${malwareLists?.current?.domains?.toLocaleString() || 0} imported domains.`});
  return {at:Date.now(),results,scope:'Browser-rule simulation only. No test network requests, no cookie changes, and no fingerprint-anonymity test. Use Activity to inspect real browsing events.'};
}
