import {SOURCE_URL, CNAME_URL, makeSnapshot, maintainedRules} from './easyprivacy.js';
export const UPDATE_ALARM = 'localguard-list-check';
let state;
export async function initializeLists() {
  state = (await chrome.storage.local.get('lists')).lists;
  if (!state?.current) {
    const text = await (await fetch(chrome.runtime.getURL('lists/easyprivacy.txt'))).text();
    const snapshot=await makeSnapshot(text);
    const version=snapshot.version;
    snapshot.fetchedAt=Date.UTC(+version.slice(0,4),+version.slice(4,6)-1,+version.slice(6,8),+version.slice(8,10),+version.slice(10,12));
    state = {enabled:true, autoUpdate:true, current:snapshot, previous:null, lastChecked:null, lastError:null};
    await chrome.storage.local.set({lists:state});
  }
  if (!(await chrome.alarms.get(UPDATE_ALARM))) await chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:60});
}
export function listRules(settings, proposed=state) {return maintainedRules(proposed.current,settings,proposed.enabled);}
export function listStatus() {
  const {current,previous,...rest}=state;
  const summarize = snapshot => snapshot && ({version:snapshot.version,domains:snapshot.domains.length,exceptions:snapshot.exceptions.length,skipped:snapshot.skipped,fetchedAt:snapshot.fetchedAt,sha256:snapshot.sha256});
  return {...rest, current:summarize(current), previous:summarize(previous), source:SOURCE_URL, nextCheckAfter:state.autoUpdate ? (state.lastChecked || state.current.fetchedAt)+86400000 : null};
}
export function listVersion() {return state?.current?.version || 'loading';}
export function updateDue() {return state?.autoUpdate && Date.now()-(state.lastChecked || state.current.fetchedAt)>=86400000;}

async function fetchText(url, controller) {
  const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
  const reader=response.body.getReader(), chunks=[];
  let total=0;
  for (;;) {
    const {done,value}=await reader.read();if(done)break;
    total+=value.length;
    if(total>4_000_000){await reader.cancel();throw new Error('List download exceeded the size limit.');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

async function download() {
  const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    const epText = await fetchText(SOURCE_URL, controller);
    const cnameText = await fetchText(CNAME_URL, controller).catch(() => ''); // Fallback to empty if CNAME fails
    return await makeSnapshot(epText, cnameText);
  } finally {clearTimeout(timer);}
}

export async function changeLists(message, settings, apply) {
  const old=state;
  let proposed={...state};
  if (message.type==='listUpdate') {
    try {
      const candidate=await download();
      if(candidate.version < state.current.version) throw new Error('The server supplied an older list; keeping the installed version.');
      if(candidate.domains.length < state.current.domains.length*0.75) throw new Error('Unexpectedly large list reduction; keeping the installed version.');
      if(candidate.sha256!==state.current.sha256) proposed={...proposed,current:candidate,previous:state.current};
      proposed.lastChecked=Date.now();proposed.lastError=null;
    } catch(error) {
      const failed={...state,lastChecked:Date.now(),lastError:error.name==='AbortError'?'List download timed out. Previous protection is unchanged.':error.message};
      await chrome.storage.local.set({lists:failed});state=failed;
      return listStatus();
    }
  } else if(message.type==='listRollback') {
    if(!state.previous)throw new Error('There is no previous downloaded version yet.');
    proposed={...proposed,current:state.previous,previous:state.current,autoUpdate:false,lastError:null};
  } else if(message.type==='listSet') {
    if(!['enabled','autoUpdate'].includes(message.key)||typeof message.value!=='boolean')throw new Error('Invalid list setting.');
    proposed[message.key]=message.value;
  } else throw new Error('Unknown list action.');
  // Browser applies all rule changes atomically. If storage fails, restore rules.
  // After interruption, startup reconciles browser rules to the committed snapshot.
  try {
    await apply(settings,proposed);
    try {await chrome.storage.local.set({lists:proposed});}
    catch(error){await apply(settings,old);throw error;}
    state=proposed;
  } catch(error) {
    const failed={...old,lastChecked:Date.now(),lastError:`Could not install list: ${error.message}`};
    await chrome.storage.local.set({lists:failed});state=failed;
  }
  return listStatus();
}
