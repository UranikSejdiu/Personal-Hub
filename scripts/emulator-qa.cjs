// Read-only smoke checks against installed offline previews. Run after preview
// builds finish: they launch activities and must not race with these inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const [selection = 'all', serial = 'emulator-5554'] = process.argv.slice(2);
const ids = ['budget','notes','tasks','dhikr'];
const selected = selection === 'all' ? ids : selection.split(',');
if (!/^emulator-\d+$/.test(serial) || selected.some(id=>!ids.includes(id)) || new Set(selected).size!==selected.length) throw Error('Choose app IDs and an emulator serial. Physical phones are excluded.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.USERPROFILE || '', 'AppData/Local/Android/Sdk');
const adb = path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const output = path.join(root,'work/qa',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run = args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:25000,stdio:['ignore','pipe','pipe']});
const decode = value=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
let sequence = 0;
function snapshot() {
  const remote = `/sdcard/uranik-qa-${process.pid}-${++sequence}.xml`;
  try {
    const dumped = run(['shell','timeout','15','uiautomator','dump',remote]);
    assert.ok(dumped.includes(remote),'Android UI is still transitioning; retry with a fresh snapshot');
    const xml = run(['shell','cat',remote]);
    assert.ok(xml.includes('<hierarchy'),'Android did not return a UI tree');
    return {xml,nodes:[...xml.matchAll(/<node\b([^>]+)/g)].map(match=>Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])])))};
  } finally { run(['shell','rm','-f',remote]); }
}
async function waitFor(predicate,label) {
  let lastError;
  for(let attempt=0;attempt<4;attempt++) {
    await pause(700);
    try { const state=snapshot(); if(predicate(state.nodes)) return state; fs.writeFileSync(path.join(output,'last.xml'),state.xml); }
    catch(error) {lastError=error;}
  }
  throw Error(`Missing expected UI: ${label}`,{cause:lastError});
}
const has = (nodes,label)=>nodes.some(n=>n.text===label||n['content-desc']===label);
async function tap(label,kind) {
  const state=await waitFor(nodes=>nodes.some(n=>n['content-desc']===label&&n.clickable==='true'&&(!kind||n.class===kind)),label);
  const matches=state.nodes.filter(n=>n['content-desc']===label&&n.clickable==='true'&&(!kind||n.class===kind));
  assert.equal(matches.length,1,`Ambiguous action: ${label}`);
  const node=matches[0];assert.equal(node.enabled,'true',`${label} is disabled`);
  const [x1,y1,x2,y2]=node.bounds.match(/\d+/g).map(Number);
  run(['shell','input','tap',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2))]);
}
function save(state,name) {
  fs.writeFileSync(path.join(output,name+'.xml'),state.xml);
  fs.writeFileSync(path.join(output,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:15000,maxBuffer:16*1024*1024}));
}
async function tab(label,expected) {
  await tap(label,'android.view.View');
  const state=await waitFor(nodes=>nodes.some(n=>n['content-desc']===label&&n.selected==='true')&&has(nodes,expected),`${label} selected with ${expected}`);
  return state;
}
async function main() {
  assert.equal(run(['shell','getprop','sys.boot_completed']).trim(),'1','Emulator must be booted');
  const results=[];
  for(const id of selected) {
    const config=JSON.parse(fs.readFileSync(path.join(root,'apps',id,'app.json'),'utf8')).expo;
    const pkg=config.android.package;
    const installed=run(['shell','dumpsys','package',pkg]);
    assert.ok(installed.includes(`versionName=${config.version}\n`)||installed.includes(`versionName=${config.version}\r`),`${id}: installed version must match source (${config.version})`);
    run(['shell','am','force-stop',pkg]);
    run(['shell','am','start','-n',`${pkg}/.MainActivity`]);
    let state=await waitFor(nodes=>nodes.some(n=>n.package===pkg&&n.clickable==='true'),id+' cold launch');
    save(state,id+'-launch');
    const pid=run(['shell','pidof',pkg]).trim();
    assert.ok(pid,`${id} process is running`);
    if(id==='budget') {
      state=await tab('Savings','Total savings'); save(state,'budget-savings');
      state=await tab('Payments','Add loan'); save(state,'budget-payments');
      state=await tab('Settings','Backup & restore'); save(state,'budget-settings');
      state=await tab('Months','Monthly budget'); save(state,'budget-months');
    } else if(id==='notes') {
      state=await tab('Archive','Archive'); save(state,'notes-archive');
      state=await tab('Notes','My Notes');
      await tap('Settings','android.widget.Button');
      state=await waitFor(nodes=>has(nodes,'Backup & restore'),'Notes settings'); save(state,'notes-settings');
      run(['shell','input','keyevent','4']);
      await waitFor(nodes=>has(nodes,'My Notes')&&has(nodes,'View options'),'Notes return from settings');
    } else if(id==='tasks') {
      state=await tab('Calendar','A little planning.'); save(state,'tasks-calendar');
      assert.ok(!state.nodes.some(n=>n['content-desc']==='Lists'),'Tasks list navigation is removed');
      const nav=state.nodes.filter(n=>n.class==='android.view.View'&&n.clickable==='true'&&['Today','Calendar','Settings'].includes(n['content-desc']));
      assert.equal(nav.length,3,'Tasks has three navigation tabs');
      const barTop=Math.min(...nav.map(n=>Number(n.bounds.match(/\d+/g)[1])));
      assert.equal(state.nodes.filter(n=>n.package===pkg&&n.clickable==='true'&&Number(n.bounds.match(/\d+/g)[1])>=barTop).length,3,'The Tasks bar contains only navigation');
      assert.ok(state.nodes.some(n=>n['content-desc']==='Add task for selected day'&&Number(n.bounds.match(/\d+/g)[3])<=barTop),'Calendar Add belongs inside the screen');
      state=await tab('Settings','Backup & restore'); save(state,'tasks-settings');
      state=await tab('Today','Make room for today.'); save(state,'tasks-today');
    } else {
      state=await tab('Dhikrs','Dhikr'); save(state,'dhikr-list');
      state=await tab('Settings','Backup & restore'); save(state,'dhikr-settings');
      state=await tab('Counter','Dhikr'); save(state,'dhikr-counter');
    }
    // Same process throughout navigation; a native crash/restart cannot pass.
    assert.equal(run(['shell','pidof',pkg]).trim(),pid,`${id}: process survived navigation`);
    const errors=run(['logcat','-d','--pid='+pid,'-s','ReactNativeJS:E','AndroidRuntime:E']);
    fs.writeFileSync(path.join(output,id+'-errors.log'),errors);
    assert.ok(!/FATAL EXCEPTION| E ReactNativeJS:/.test(errors),`${id}: runtime errors (see ${output})`);
    run(['shell','am','force-stop',pkg]);run(['shell','am','start','-n',`${pkg}/.MainActivity`]);
    await waitFor(nodes=>nodes.some(n=>n.package===pkg&&n.clickable==='true'),id+' restart');
    results.push({app:id,version:config.version,status:'passed',checks:['cold launch','main screens','settings','navigation without process restart','runtime error log','force-stop/relaunch']});
    console.log(`${id} ${config.version}: smoke checks passed`);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  }
  console.log('QA evidence: '+output);
}
if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,snapshot,waitFor,tap,save,pause,has,output};
