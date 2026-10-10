/* global __dirname */
// Count actual Hub haptic calls and preference reads without native hardware.
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

  console.log('Passed: Hub haptic preferences share one read, rapid pulses are bounded, and disabled feedback makes no native calls.');
}
module.exports=main;
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
