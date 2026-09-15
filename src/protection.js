const $=id=>document.getElementById(id);
let lists, malwareLists, settings, busy=false, malwareBusy=false;
async function api(message){const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||'Protection service unavailable.');return response;}
function render(){
  $('domainCount').textContent=lists.current.domains.toLocaleString();$('exceptionCount').textContent=lists.current.exceptions.toLocaleString();
  $('version').textContent=lists.current.version;$('previous').textContent=lists.previous?.version||'None saved yet';
  $('lastCheck').textContent=lists.lastChecked?new Date(lists.lastChecked).toLocaleString():'Not checked yet; bundled snapshot installed';
  $('nextCheck').textContent=lists.nextCheckAfter?new Date(lists.nextCheckAfter).toLocaleString()+' or next hourly check while the browser is running':'Automatic updates paused';
  $('hash').textContent='Source SHA-256: '+lists.current.sha256;
  $('skipped').textContent=lists.current.skipped.toLocaleString()+' unsupported blocking filters omitted. First-party-only exceptions are unnecessary for this third-party-only subset.';
  if(!busy){$('listEnabled').checked=lists.enabled;$('autoUpdate').checked=lists.autoUpdate;}
  $('listBadge').textContent=lists.enabled?'List enabled':'List disabled';
  $('listMessage').textContent=lists.lastError||'List ready. Your main protection and tracker switches control whether it blocks requests.';
  $('listMessage').classList.toggle('error',Boolean(lists.lastError));
  for(const id of ['listEnabled','autoUpdate','update'])$(id).disabled=busy;
  $('rollback').disabled=busy||!lists.previous;

  if (malwareLists?.current) {
    $('malwareDomainCount').textContent=malwareLists.current.domains.toLocaleString();
    $('malwareLastCheck').textContent=malwareLists.lastChecked?new Date(malwareLists.lastChecked).toLocaleString():'Not checked yet';
    $('malwareNextCheck').textContent=malwareLists.nextCheckAfter?new Date(malwareLists.nextCheckAfter).toLocaleString()+' or next hourly check while the browser is running':'Automatic updates paused';
    $('malwareHash').textContent='Source SHA-256: '+malwareLists.current.sha256;
  } else {
    $('malwareDomainCount').textContent='—';
    $('malwareLastCheck').textContent='—';
    $('malwareNextCheck').textContent='—';
    $('malwareHash').textContent='Not downloaded yet';
  }
  
  if(!malwareBusy){$('malwareEnabledMode').value=malwareLists?.enabledMode || 'off';$('malwareAutoUpdate').checked=malwareLists?.autoUpdate;}
  $('malwareBadge').textContent=malwareLists?.enabledMode !== 'off' ?'List enabled':'List disabled';
  $('malwareMessage').textContent=malwareLists?.lastError||(malwareLists?.current ? 'List ready. Blocks connections to known dangerous sites.' : 'List not downloaded yet.');
  $('malwareMessage').classList.toggle('error',Boolean(malwareLists?.lastError));
  for(const id of ['malwareEnabledMode','malwareAutoUpdate','malwareUpdate'])$(id).disabled=malwareBusy;
  $('malwareRollback').disabled=malwareBusy||!malwareLists?.previous;

  if (settings) {
    if (document.activeElement !== $('blockedDomainsInput')) $('blockedDomainsInput').value = (settings.userBlockedDomains || []).join('\n');
    if (document.activeElement !== $('allowedDomainsInput')) $('allowedDomainsInput').value = (settings.userAllowedDomains || []).join('\n');
    $('userBlockedCount').textContent = (settings.userBlockedDomains || []).length;
    $('userAllowedCount').textContent = (settings.userAllowedDomains || []).length;
  }
}
async function change(message){
  const isMalware = message.type.startsWith('malware');
  if(isMalware){
    if(malwareBusy)return;malwareBusy=true;if(malwareLists)render();
    $('malwareMessage').textContent=message.type==='malwareUpdate'?'Downloading and parsing lists…':'Applying…';
  } else {
    if(busy)return;busy=true;if(lists)render();
    $('listMessage').textContent=message.type==='listUpdate'?'Downloading and validating list…':'Applying…';
  }
  
  let failure;
  try{
    const res = await api(message);
    if(res.settings) settings = res.settings;
    if(res.lists) lists = res.lists;
    if(res.malwareLists) malwareLists = res.malwareLists;
  }
  catch(error){failure=error.message;}
  finally{
    if(isMalware){
      malwareBusy=false;
      if(malwareLists)render();
      if(failure){$('malwareMessage').textContent=failure;$('malwareMessage').classList.add('error');}
    } else {
      busy=false;
      if(lists)render();
      if(failure){$('listMessage').textContent=failure;$('listMessage').classList.add('error');}
    }
  }
}
$('listEnabled').addEventListener('change',e=>change({type:'listSet',key:'enabled',value:e.target.checked}));
$('autoUpdate').addEventListener('change',e=>change({type:'listSet',key:'autoUpdate',value:e.target.checked}));
$('update').addEventListener('click',()=>change({type:'listUpdate'}));
$('rollback').addEventListener('click',()=>change({type:'listRollback'}));

$('malwareEnabledMode').addEventListener('change',e=>change({type:'malwareSetMode',value:e.target.value}));
$('malwareAutoUpdate').addEventListener('change',e=>change({type:'malwareSet',key:'autoUpdate',value:e.target.checked}));
$('malwareUpdate').addEventListener('click',()=>change({type:'malwareUpdate'}));
$('malwareRollback').addEventListener('click',()=>change({type:'malwareRollback'}));

$('saveCustomRules').addEventListener('click', async () => {
  $('saveCustomRules').disabled = true;
  $('customRulesMessage').textContent = 'Saving...';
  $('customRulesMessage').classList.remove('error');
  try {
    const blocked = $('blockedDomainsInput').value.split('\n').map(l=>l.trim()).filter(l=>l);
    const allowed = $('allowedDomainsInput').value.split('\n').map(l=>l.trim()).filter(l=>l);
    await change({type: 'setCustomRules', blockedDomains: blocked, allowedDomains: allowed});
    $('customRulesMessage').textContent = 'Saved successfully.';
    setTimeout(() => { if ($('customRulesMessage').textContent === 'Saved successfully.') $('customRulesMessage').textContent = ''; }, 3000);
  } catch (error) {
    $('customRulesMessage').textContent = error.message;
    $('customRulesMessage').classList.add('error');
  } finally {
    $('saveCustomRules').disabled = false;
  }
});

$('test').addEventListener('click',async()=>{
  $('test').disabled=true;$('testStatus').textContent='Checking the browser’s active rules…';$('results').replaceChildren();
  try{
    const {test}=await api({type:'selfTest'});
    for(const result of test.results){
      const row=document.createElement('li'),state=document.createElement('span'),body=document.createElement('div'),detail=document.createElement('small');
      state.textContent=result.status.toUpperCase();state.className='result-state '+result.status;
      body.textContent=result.name;detail.textContent=result.detail;body.append(detail);row.append(state,body);$('results').append(row);
    }
    const count=status=>test.results.filter(r=>r.status===status).length;
    $('testStatus').textContent=`${count('pass')} passed · ${count('off')} off · ${count('fail')} failed · ${count('unavailable')} unavailable. Checked ${new Date(test.at).toLocaleTimeString()}.`;
  }catch(error){$('testStatus').textContent='Test unavailable: '+error.message;}
  finally{$('test').disabled=false;}
});
await change({type:'state'}); // request initial settings and lists state
