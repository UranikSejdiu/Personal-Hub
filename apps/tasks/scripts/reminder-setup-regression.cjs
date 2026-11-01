// Exercise real switch callbacks against deferred permission/settings results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

module.exports = async function verifyReminderSetup(root) {
  function fixture(initial = {}) {
    const env = { notifications: false, access: { exactAlarms: false, batteryUnrestricted: false }, version: 36, ...initial };
    const slots = [], opened = [], errors = [];
    let cursor = 0, tree, focus, previousFocus, cleanup, listener;
    let requests = 0, syncs = 0, readGate, requestGate, requestFailure = false;
    let settingsChange = () => {};
    const same = (a,b) => a && b && a.length === b.length && a.every((value,index)=>Object.is(value,b[index]));
    const react = {
      useState(initialValue) { const i=cursor++; if(!(i in slots)) slots[i]=typeof initialValue==='function'?initialValue():initialValue; return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}]; },
      useRef(initialValue) { const i=cursor++; return slots[i]??={current:initialValue}; },
      useCallback(fn,deps) { const i=cursor++; if(!slots[i]||!same(slots[i].deps,deps)) slots[i]={deps,value:fn}; return slots[i].value; },
    };
    const t = key=>key;
    const mocks = {
      react,
      'react/jsx-runtime': {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
      'react-native': { View:'View',Switch:'Switch',Platform:{OS:'android',Version:env.version},AppState:{addEventListener:(_name,fn)=>{listener=fn;return {remove(){listener=null;}};}} },
      'expo-router': {useFocusEffect:fn=>{focus=fn;}},
      'sonner-native': {toast:{error:message=>errors.push(message)}},
      '../../lib/i18n': {useI18n:()=>({t})},
      '../../lib/theme': {useThemeColors:()=>({})},
      '../ui/Typography': {Text:'Text'},
      '../../lib/reminderAccess': {
        getReminderAccess:()=>env.access?{...env.access}:null,
        async openReminderSettings(kind) { opened.push(kind); await settingsChange(kind); },
      },
      '../../lib/taskReminders': {
        async taskReminderNotificationsEnabled() { const value=env.notifications; const wait=readGate;readGate=null;if(wait)await wait.promise;return value; },
        async requestTaskReminderPermission() { requests++;if(requestGate)await requestGate.promise;if(requestFailure)throw Error('Permission unavailable');if(env.result==='denied')return 'denied';env.notifications=true;return 'granted'; },
        async syncTaskReminders() {syncs++;},
      },
    };
    const module={exports:{}};
    const file=path.join(root,'src/components/tasks/ReminderSetup.tsx');
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];}},{filename:file});
    function render() {cursor=0;tree=module.exports.ReminderSetup();if(focus!==previousFocus){cleanup?.();previousFocus=focus;cleanup=focus();}}
    function nodes(type) {const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n?.props)return;if(n.type===type)found.push(n);visit(n.props.children);}visit(tree);return found;}
    const view={env,opened,errors,render,nodes,
      async settle(){await flush();await flush();render();},
      switch(label){const row=nodes('Switch').find(n=>n.props.accessibilityLabel===label);assert.ok(row,label);return row.props;},
      change(label,enabled){this.switch(label).onValueChange(enabled);},
      resume(){listener?.('active');},
      deferRead(value){readGate=value;},deferPermission(value){requestGate=value;},failPermission(value){requestFailure=value;},
      settings(fn){settingsChange=fn;},get requests(){return requests;},get syncs(){return syncs;},
      dispose(){cleanup?.();assert.equal(listener,null,'AppState listener removed');},
    };
    render();return view;
  }
  const notifications='tasksReminderNotifications',alarms='tasksReminderExactAlarms',battery='tasksReminderBattery';
  {
    const h=fixture();await h.settle();
    assert.equal(h.nodes('Switch').length,3);
    for(const label of [notifications,alarms,battery])assert.equal(h.switch(label).value,false);
    const pending=gate();h.deferPermission(pending);
    h.change(notifications,true);h.change(notifications,true);h.render();
    assert.equal(h.requests,1,'Rapid toggles cannot launch duplicate permission prompts');
    assert.equal(h.switch(notifications).value,false,'Never show permission as granted before Android confirms');
    assert.ok(h.nodes('Switch').every(n=>n.props.disabled));
    pending.resolve();await h.settle();
    assert.equal(h.switch(notifications).value,true);assert.equal(h.syncs,1);assert.equal(h.opened.length,0);
    h.change(notifications,false);await h.settle();
    assert.equal(h.opened.at(-1),'notifications');assert.equal(h.requests,1,'Turning off opens settings rather than requesting access');
    assert.equal(h.switch(notifications).value,true,'Cancelling Android settings preserves the real on state');
    h.settings(kind=>{if(kind==='notifications')h.env.notifications=false;});
    h.change(notifications,false);await h.settle();assert.equal(h.switch(notifications).value,false);
    h.dispose();
  }
  {
    const h=fixture({result:'denied'});await h.settle();h.change(notifications,true);await h.settle();
    assert.deepEqual(h.opened,['notifications']);assert.equal(h.switch(notifications).value,false);assert.equal(h.syncs,0,'Denied permission cannot schedule reminders');h.dispose();
  }
  {
    const h=fixture();await h.settle();
    h.settings(kind=>{if(kind==='alarms')h.env.access.exactAlarms=true;if(kind==='battery')h.env.access.batteryUnrestricted=true;});
    h.change(alarms,true);await h.settle();h.change(battery,true);await h.settle();
    assert.deepEqual(h.opened,['alarms','battery']);assert.equal(h.switch(alarms).value,true);assert.equal(h.switch(battery).value,true);
    h.env.access.exactAlarms=false;h.env.access.batteryUnrestricted=false;h.resume();await h.settle();
    assert.equal(h.switch(alarms).value,false);assert.equal(h.switch(battery).value,false,'Returning from Android reflects revoked access');h.dispose();
  }
  {
    const h=fixture();await h.settle();h.failPermission(true);h.change(notifications,true);await h.settle();
    assert.deepEqual(h.errors,['tasksReminderSettingsFailed']);assert.ok(h.nodes('Switch').every(n=>!n.props.disabled));
    h.failPermission(false);h.change(notifications,true);await h.settle();assert.equal(h.switch(notifications).value,true,'A failed request can be retried');h.dispose();
  }
  {
    const h=fixture();await h.settle();const oldRead=gate();h.deferRead(oldRead);h.resume();
    h.env.notifications=true;h.resume();await h.settle();assert.equal(h.switch(notifications).value,true);
    oldRead.resolve();await h.settle();assert.equal(h.switch(notifications).value,true,'A stale permission read cannot overwrite newer settings');h.dispose();
  }
  {
    const h=fixture({notifications:null,access:null});await h.settle();assert.ok(h.nodes('Switch').every(n=>n.props.disabled));h.dispose();
    const legacy=fixture({version:30,access:{exactAlarms:true,batteryUnrestricted:false}});await legacy.settle();
    assert.equal(legacy.switch(alarms).value,true);assert.equal(legacy.switch(alarms).disabled,true,'Older Android has no exact-alarm permission to toggle');legacy.dispose();
  }
  console.log('Passed reminder switches: actual permission states, grant/deny, settings cancellation/revocation, rapid-toggle locking, failure retry, stale reads, native availability and cleanup.');
};
