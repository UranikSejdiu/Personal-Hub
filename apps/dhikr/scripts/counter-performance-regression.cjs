/* global __dirname */
// Exercise the actual counter screen with deferred writes and app lifecycle events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function counterFixture() {
  const slots = [];
  let cursor = 0, focus, cleanup, focusedCallback, tree;
  let focused = true, day = '2026-10-10', selected = 1;
  let readCalls = 0, writes = 0, otherRecordReads = 0;
  let failNext = false, rejectNext = false, failReset = false, resetGate = null, readGate = null;
  let writeQueue = Promise.resolve();
  const timers = new Map(), listeners = new Set(), errors = [], feedback = [];
  const persisted = new Map(Array.from({length: 3000}, (_, index) => {
    const id = index + 1;
    return [id, { id, name: 'Dhikr ' + id, total_count: 0, daily_count: 0,
      daily_limit: id === 1 ? 10 : null, last_reset_date: day }];
  }));
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index=cursor++; if(!(index in slots)) slots[index]={current:initial}; return slots[index]; },
    useMemo(fn,deps) { const index=cursor++; if(!slots[index]||!same(slots[index].deps,deps)) slots[index]={deps,value:fn()}; return slots[index].value; },
    useCallback(fn,deps) { return hooks.useMemo(()=>fn,deps); },
  };
  const haptics = Object.fromEntries(['light','success','warning'].map(kind=>[kind,async()=>feedback.push(kind)]));
  const t = key => key;
  const native = { currentState:'active', addEventListener: (_event,callback) => {
    listeners.add(callback); return {remove:()=>listeners.delete(callback)};
  }};
  const mocks = {
    react:hooks, 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    'react-native':{AppState:native,View:'View',Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator',useWindowDimensions:()=>({fontScale:1,width:390,height:844})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},
    'expo-router':{useRouter:()=>({push(){}}),useFocusEffect:fn=>{focus=fn;}},
    'sonner-native':{toast:{error:x=>errors.push(x),success(){}}},
    '../../src/components/ui/Typography':{Text:'Text'},
    '../../src/components/DhikrCounterTitle':{DhikrCounterTitle:'Title'},
    '../../src/components/ConfirmDialog':{ConfirmDialog:'ConfirmDialog'},
    '../../src/components/AppIcons':new Proxy({}, {get:(_target,key)=>key}),
    '../../src/components/Fireworks':{__esModule:true,default:'Fireworks'},
    '../../src/lib/i18n':{useI18n:()=>({t})},
    '../../src/hooks/useHaptics':{useHaptics:()=>haptics},
    '../../src/lib/theme':{useThemeColors:()=>({})},
    '../../src/lib/utils':{withAlpha:x=>x},
    '../../src/lib/dhikrSelection':{getSelectedDhikrId:async()=>selected,setSelectedDhikrId:async id=>{selected=id;}},
    '../../src/lib/dhikr':{
      todayDate:()=>day,
      async loadDhikrs() {
        readCalls++;
        if(readGate) await readGate.promise;
        return [...persisted.values()].map(row=>{
          if(row.last_reset_date < day) { row.daily_count=0; row.last_reset_date=day; }
          const copy={...row};
          return new Proxy(copy,{get:(target,key)=>{
            if(key==='id' && target.id!==1) otherRecordReads++;
            return target[key];
          }});
        });
      },
      flushDhikrWrites:()=>writeQueue,
      queueDhikrWrite(task) { const result=writeQueue.then(task); writeQueue=result.then(()=>{},()=>{}); return result; },
      async incrementDhikr(id, tapDay) {
        writes++;
        if(failNext) { failNext=false; throw new Error('Disk write failed'); }
        if(rejectNext) { rejectNext=false; return false; }
        const row=persisted.get(id);
        const daily=row.last_reset_date < tapDay ? 0 : row.daily_count;
        if(row.daily_limit>0 && daily>=row.daily_limit) return false;
        row.total_count++; row.daily_count=daily+1; row.last_reset_date=tapDay;
        return true;
      },
      async resetDhikr(id) {
        if(failReset) { failReset=false; throw new Error('Reset failed'); }
        if(resetGate) await resetGate.promise;
        const row=persisted.get(id); row.total_count=0; row.daily_count=0; row.last_reset_date=day;
      },
    },
  };
  const module={exports:{}};
  const filename=path.join(root,'app/(dhikr)/index.tsx');
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code,{
    module,exports:module.exports,
    require:key=>{assert(key in mocks,'Unexpected counter dependency: '+key);return mocks[key];},
    setTimeout:fn=>{const id=Symbol();timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id),
  },{filename});
  function nodes(predicate) {
    const result=[];
    function visit(node) {
      if(Array.isArray(node)) {node.forEach(visit);return;}
      if(!node?.props) return;
      if(predicate(node)) result.push(node);
      visit(node.props.children);
    }
    visit(tree);return result;
  }
  return {
    render() {
      cursor=0;tree=module.exports.default();
      if(focused && focusedCallback!==focus) {cleanup?.();focusedCallback=focus;cleanup=focus();}
    },
    button:label=>nodes(n=>n.props.accessibilityLabel===label)[0]?.props,
    count:()=>nodes(n=>n.props.testID==='dhikr-total-count')[0]?.props.children,
    countProps:()=>nodes(n=>n.props.testID==='dhikr-total-count')[0]?.props,
    dialog:()=>nodes(n=>n.type==='ConfirmDialog')[0]?.props,
    fireworks:()=>nodes(n=>n.type==='Fireworks').length,
    state(next) {native.currentState=next;listeners.forEach(fn=>fn(next));},
    blur() {focused=false;cleanup?.();cleanup=null;focusedCallback=null;},
    focus() {focused=true;this.render();},
    setDay:value=>{day=value;},
    drain:()=>writeQueue,
    fail:()=>{failNext=true;},
    failReset:()=>{failReset=true;},
    reject:()=>{rejectNext=true;},
    holdReset:()=>{resetGate=gate();return resetGate;},
    holdRead:()=>{readGate=gate();return readGate;},
    holdWrites:()=>{const paused=gate();writeQueue=writeQueue.then(()=>paused.promise);return paused;},
    resetVisits:()=>{otherRecordReads=0;},
    get visits(){return otherRecordReads;},
    get writes(){return writes;},
    get reads(){return readCalls;},
    persisted, feedback, errors, timers,
  };
}

async function main() {
  const f=counterFixture();
  f.render();await flush();f.render();f.resetVisits();
  for(let i=0;i<15;i++) f.button('tapToCount').onPress();
  f.render();assert.equal(f.count(),'10');
  await f.drain();f.render();
  assert.equal(f.persisted.get(1).total_count,10);
  assert.equal(f.writes,10,'Over-limit presses never enqueue database writes');
  assert.equal(f.feedback.filter(x=>x==='light').length,9);
  assert.equal(f.feedback.filter(x=>x==='success').length,1,'Goal completion uses one haptic effect');
  assert.equal(f.feedback.filter(x=>x==='warning').length,1);
  assert.equal(f.visits,0,'Taps must not walk the other 2,999 records');
  assert.equal(f.timers.size,1,'Repeated limit warnings share one timer');

  // Midnight while the counter remains visible must allow the new day's taps.
  f.setDay('2026-10-11');
  f.button('tapToCount').onPress();await f.drain();f.render();
  assert.equal(f.count(),'11');assert.equal(f.persisted.get(1).daily_count,1);
  f.state('background');f.render();
  assert.equal(f.fireworks(),0);assert.equal(f.timers.size,0);
  const reads=f.reads,writes=f.writes;
  f.button('tapToCount').onPress();await f.drain();
  assert.equal(f.reads,reads);assert.equal(f.writes,writes,'Background screens cannot schedule taps');
  f.state('active');await flush();f.render();
  assert.equal(f.reads,reads+1);assert.equal(f.count(),'11');

  const reset=f.holdReset();
  f.button('resetLabel').onPress();f.render();
  assert.equal(f.dialog().visible,true);
  assert.equal(f.count(),'11','Opening reset does not change counts');
  f.dialog().onClose();f.render();
  assert.equal(f.count(),'11','Cancelling reset preserves counts');
  f.button('resetLabel').onPress();f.render();
  f.failReset();await f.dialog().onConfirm();f.render();
  assert.equal(f.dialog().visible,true,'A failed reset remains available to retry');
  assert.equal(f.count(),'11');
  assert.equal(f.errors.at(-1),'errorResettingDhikr');
  const resetting=f.dialog().onConfirm();
  await flush();f.render();
  assert(f.button('tapToCount').disabled);
  f.button('tapToCount').onPress();
  reset.resolve();await resetting;f.render();
  assert.equal(f.count(),'0');
  assert.equal(f.dialog().visible,false);
  f.fail();
  f.button('tapToCount').onPress();f.button('tapToCount').onPress();
  await f.drain();f.render();
  assert.equal(f.count(),'1');assert.equal(f.persisted.get(1).total_count,1);
  assert.equal(f.errors.at(-1),'errorSavingData');
  f.reject();f.button('tapToCount').onPress();await f.drain();f.render();
  assert.equal(f.count(),'1','A rejected write reverses exactly one optimistic increment');

  // A queued tap retains its calendar day, even when another tap follows after midnight.
  const paused=f.holdWrites();
  f.fail();f.button('tapToCount').onPress();
  f.setDay('2026-10-12');f.button('tapToCount').onPress();
  paused.resolve();await f.drain();f.render();
  assert.equal(f.count(),'2');assert.equal(f.persisted.get(1).daily_count,1);

  // A stale read completing after blur cannot restore old screen data.
  const late=f.holdRead();
  f.state('background');f.state('active');await flush();
  f.blur();late.resolve();await flush();f.render();
  assert.equal(f.count(),'2');
  f.focus();await flush();f.render();
  assert.equal(f.count(),'2');
  f.button('nextDhikr').onPress();f.render();assert.equal(f.count(),'0');
  f.button('tapToCount').onPress();await f.drain();f.render();assert.equal(f.count(),'1');
  f.button('previousDhikr').onPress();f.render();assert.equal(f.count(),'2');
  // A confirmation always targets the named record, even if selection changes.
  f.button('resetLabel').onPress();f.render();
  f.button('nextDhikr').onPress();f.render();
  await f.dialog().onConfirm();f.render();
  assert.equal(f.count(),'1');assert.equal(f.persisted.get(1).total_count,0);
  assert.equal(f.persisted.get(2).total_count,1);
  f.persisted.get(2).total_count=Number.MAX_SAFE_INTEGER;
  f.blur();f.focus();await flush();f.render();
  const maximumWrites=f.writes;
  f.button('tapToCount').onPress();await f.drain();f.render();
  assert.equal(f.count(),Number.MAX_SAFE_INTEGER.toLocaleString());
  assert.equal(f.writes,maximumWrites,'Maximum counts must not enqueue an unsafe increment');
  assert.equal(f.errors.at(-1),'countMaximumReached');
  assert(f.countProps().adjustsFontSizeToFit,'Large counts shrink within the tap target');
  assert.equal(f.countProps().numberOfLines,1);
  f.blur();
  assert.equal(f.timers.size,0);
  console.log('Passed: rapid counts, O(1) tap work across 3,000 records, single goal haptic, bounded warning timers, midnight, reset isolation, rollback, background cleanup, selection, and stale-read cancellation.');
}
module.exports = main;
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
