const $=id=>document.getElementById(id);
let lists,busy=false;
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
}
async function change(message){
  if(busy)return;busy=true;if(lists)render();
  let failure;
  $('listMessage').textContent=message.type==='listUpdate'?'Downloading and validating list…':'Applying…';
  try{lists=(await api(message)).lists;}
  catch(error){failure=error.message;}
  finally{busy=false;if(lists)render();if(failure){$('listMessage').textContent=failure;$('listMessage').classList.add('error');}}
}
$('listEnabled').addEventListener('change',e=>change({type:'listSet',key:'enabled',value:e.target.checked}));
$('autoUpdate').addEventListener('change',e=>change({type:'listSet',key:'autoUpdate',value:e.target.checked}));
$('update').addEventListener('click',()=>change({type:'listUpdate'}));
$('rollback').addEventListener('click',()=>change({type:'listRollback'}));
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
await change({type:'listState'});
