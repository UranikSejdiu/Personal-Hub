/* global __dirname */
// Count actual haptic calls and animation timelines without native hardware.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(file,mocks,extra={}) {
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,
    require:key=>{assert(key in mocks,key);return mocks[key];},...extra});
  return module.exports;
}
async function main() {
  let now=10000,reads=0,stored='true';
  const pulses=[];
  let resolveRead;
  const hooks={useEffect(){},useCallback:fn=>fn,useMemo:fn=>fn()};
  class Clock extends Date {static now(){return now;}}
  const haptics=compile('src/hooks/useHaptics.ts',{
    react:hooks,
    'expo-haptics':{
      ImpactFeedbackStyle:{Light:'light',Medium:'medium'},
      NotificationFeedbackType:{Success:'success',Warning:'warning'},
      impactAsync:async kind=>pulses.push(kind),
      notificationAsync:async kind=>pulses.push(kind),
    },
    '../lib/preferences':{
      getPreference:()=>{reads++;return new Promise(resolve=>{resolveRead=()=>resolve(stored);});},
      setPreference:async (_key,value)=>{stored=value;},
    },
  },{Date:Clock});
  const readers=Array.from({length:30},()=>haptics.getHapticsEnabled());
  assert.equal(reads,1,'Mounted rows share one preference read');
  resolveRead();await Promise.all(readers);
  const feedback=haptics.useHaptics();
  for(let i=0;i<20;i++){await feedback.light();now+=5;}
  assert.equal(pulses.filter(x=>x==='light').length,2,'Rapid presses have bounded haptic frequency');
  for(let i=0;i<20;i++){await feedback.warning();now+=5;}
  assert.equal(pulses.filter(x=>x==='warning').length,1,'Repeated warnings do not vibrate repeatedly');
  await haptics.setHapticsEnabled(false);
  await feedback.light();await feedback.success();await feedback.warning();
  assert.equal(pulses.length,3,'Disabled haptics never call native feedback');
  assert.equal(await haptics.getHapticsEnabled(),false);
  assert.equal(reads,1,'Loaded preferences stay in memory');

  function animationFixture(reduced) {
    const slots=[],effects=[],timers=new Map();
    let cursor=0,timelines=0,cancels=0;
    const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
    const react={
      memo:fn=>fn,
      useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],()=>{}];},
      useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},
      useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
    };
    const animated={
      __esModule:true,default:{View:'AnimatedView'},
      useSharedValue(value){return react.useRef(value);},
      useReducedMotion:()=>reduced,
      useAnimatedStyle:fn=>fn(),
      withTiming(value){timelines++;return value;},
      cancelAnimation(){cancels++;},
      Easing:{out:fn=>fn,quad:x=>x},
    };
    const component=compile('src/components/Fireworks.tsx',{
      react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
      'react-native':{View:'View',StyleSheet:{create:styles=>styles}},
      'react-native-reanimated':animated,
    },{
      setTimeout:fn=>{const id=Symbol();timers.set(id,fn);return id;},
      clearTimeout:id=>timers.delete(id),
    }).default;
    return{
      render(onComplete){cursor=0;effects.length=0;const tree=component({onComplete});effects.forEach(fn=>fn());return tree;},
      dispose(){slots.forEach(slot=>slot?.cleanup?.());},
      get timelines(){return timelines;},get cancels(){return cancels;},timers,
    };
  }
  const animation=animationFixture(false);
  animation.render(()=>{});animation.render(()=>{});
  assert.equal(animation.timelines,1,'Changing callbacks must not restart the shared timeline');
  assert.equal(animation.timers.size,1);
  animation.dispose();assert.equal(animation.cancels,1);assert.equal(animation.timers.size,0);
  const reduced=animationFixture(true);
  let done=0;
  assert.equal(reduced.render(()=>{done++;}),null);
  assert.equal(done,1);assert.equal(reduced.timelines,0);assert.equal(reduced.timers.size,0);
  console.log('Passed: 30 rows share one preference read; 20 rapid taps use 2 haptic calls; fireworks use 1 timeline and no animations in reduced-motion mode.');
}
module.exports=main;
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
