import {SOURCE_URL, CNAME_URL, makeSnapshot, maintainedRules} from './easyprivacy.js';
import { saveList, loadList } from './db.js';
import { processLists } from './parser-worker.js';
export const UPDATE_ALARM = 'localguard-list-check';
let state;
export async function initializeLists() {
  state = await loadList('easyprivacy');
  if (!state) {
    const oldState = (await chrome.storage.local.get('lists')).lists;
    if (oldState) {
      state = oldState;
      await saveList('easyprivacy', state);
      await chrome.storage.local.remove('lists');
    }
  }
  if (!state?.current) {
    const text = await (await fetch(chrome.runtime.getURL('lists/easyprivacy.txt'))).text();
    const snapshot=await makeSnapshot(text);
    const version=snapshot.version;
    snapshot.fetchedAt=Date.UTC(+version.slice(0,4),+version.slice(4,6)-1,+version.slice(6,8),+version.slice(8,10),+version.slice(10,12));
    state = {enabled:true, autoUpdate:true, current:snapshot, previous:null, lastChecked:null, lastError:null, failureCount: 0};
    await saveList('easyprivacy', state);
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
export function updateDue() {return state?.autoUpdate && (state.failureCount > 0 || Date.now()-(state.lastChecked || state.current?.fetchedAt || 0)>=86400000);}

// fetchText is now inside parser-worker.js

function executeInWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('parser-worker.js');
    const id = Date.now() + Math.random();
    worker.onmessage = (e) => {
      if (e.data.id === id) {
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.result);
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage({ id, type, ...payload });
  });
}

async function download() {
  const controller = new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    if (typeof Worker === 'undefined') {
      const result = await processLists(SOURCE_URL, CNAME_URL);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return result;
    }
    const result = await executeInWorker('parseLists', { sourceUrl: SOURCE_URL, cnameUrl: CNAME_URL });
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return result;
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
      proposed.lastChecked=Date.now();proposed.lastError=null;proposed.failureCount=0;
      await chrome.alarms.clear(UPDATE_ALARM + '-retry');
    } catch(error) {
      const failureCount = (state.failureCount || 0) + 1;
      const failed={...state,lastChecked:Date.now(),lastError:error.name==='AbortError'?'List download timed out. Previous protection is unchanged.':error.message, failureCount};
      const delays = [5, 15, 60, 240];
      const nextDelay = delays[Math.min(failureCount - 1, delays.length - 1)];
      await chrome.alarms.create(UPDATE_ALARM + '-retry', {delayInMinutes: nextDelay + (Math.random() * 2 - 1)});
      await saveList('easyprivacy', failed);
      state=failed;
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
    try {await saveList('easyprivacy', proposed);}
    catch(error){await apply(settings,old);throw error;}
    state=proposed;
  } catch(error) {
    const failed={...old,lastChecked:Date.now(),lastError:`Could not install list: ${error.message}`};
    await saveList('easyprivacy', failed);
    state=failed;
  }
  return listStatus();
}
