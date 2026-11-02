// Exercise real component handlers with native IO mocked. No Metro, emulator,
// network, or installed-app data is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const colors = { background: '#f8f9f4', foreground: '#26352b', primary: '#3e5948', card: '#fff', secondary: '#e6ebdf', mutedForeground: '#697266' };
const jsx = (type, props) => ({ type, props: props ?? {} });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...Object.values(tree.props ?? {}).flatMap(value => value && typeof value === 'object' && (Array.isArray(value) || value.props) ? nodes(value) : [])];
}
function harness(file, overrides = {}, modules = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const stateNames = [...source.matchAll(/const \[(\w+),\s*\w+\]\s*=\s*useState/g)].map(match => match[1]);
  const refNames = [...source.matchAll(/const (\w+)\s*=\s*useRef/g)].map(match => match[1]);
  const state = {}, events = [];
  let cursor = 0, refCursor = 0;
  const emit = kind => (message, options) => { events.push({ kind, message, options }); return events.length; };
  const toast = Object.assign(emit('info'), Object.fromEntries(['success','error','warning','info'].map(kind => [kind, emit(kind)])));
  const react = {
    useState(initial) { const name = stateNames[cursor++]; const value = Object.hasOwn(overrides, name) ? overrides[name] : typeof initial === 'function' ? initial() : initial;
      if (!Object.hasOwn(state, name)) state[name] = value;
      return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useRef: value => {const name=refNames[refCursor++];return {current:Object.hasOwn(overrides,name)?overrides[name]:value};}, useEffect: effect => { effect(); }, useCallback: fn => fn, useMemo: fn => fn(), memo: fn => fn,
  };
  const chain = { duration() { return this; }, reduceMotion() { return this; } };
  const api = { currentMonth: () => '2026-11', addMonths: () => '2026-10', computeMonthSummary: () => ({ remaining: 0, actualRemaining: 0 }), repaymentForMonth: () => 0, ...modules.budget };
  const router = { push() {}, replace() {}, setParams() {} };
  const requireMock = id => {
    if (Object.hasOwn(modules, id)) return modules[id];
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === 'react-native') return { View:'View', Pressable:'Pressable', Modal:'Modal', ScrollView:'ScrollView', FlatList:'FlatList', Image:'Image', StyleSheet:{create:v=>v}, Easing:{bezier:()=>value=>value}, Platform:{OS:'android'}, BackHandler:{addEventListener:()=>({remove(){}})}, useWindowDimensions:()=>({width:390,height:844}) };
    if (id === 'sonner-native') return { toast, Toaster:'Toaster' };
    if (id === 'expo-router') return { useFocusEffect() {}, useRouter:()=>router, useLocalSearchParams:()=>({month:'2026-11'}) };
    if (id.includes('safe-area')) return { useSafeAreaInsets:()=>({top:24,bottom:16,left:0,right:0}) };
    if (id === 'react-native-reanimated') return { __esModule:true, default:{createAnimatedComponent:c=>'Animated'+c}, FadeInDown:chain, FadeInUp:chain, FadeOutUp:chain, ReduceMotion:{System:'system'}, useReducedMotion:()=>false };
    if (id.endsWith('/i18n')) return {useI18n:()=>({t:key=>key,lang:'en'}),monthLabelShort:()=> 'Nov',monthLabelFull:()=> 'November 2026'};
    if (id.endsWith('/theme')) return {useTheme:()=>({theme:'light',resolvedTheme:'light',setTheme(){}}),useThemeColors:()=>colors,useThemeVariables:()=>({})};
    if (id.endsWith('/utils')) return {formatCurrency:n=>'€'+n,cn:(...args)=>args.filter(Boolean).join(' '),withAlpha:color=>color};
    if (id.endsWith('/numberInput')) return {parseNumberInput:text=>text.trim() ? Number(text) : null};
    if (id.endsWith('/budget')) return api;
    if (id.endsWith('/repaymentPlans')) return {repaymentForMonth:()=>0,isValidRepaymentInput:()=>true,...modules.repayments};
    if (id.endsWith('/creditCards')) return {installmentEndMonth:()=> '2027-08'};
    if (id.endsWith('/savings')) return {isClosingMarkerDescription:()=>false,...modules.savings};
    if (id.endsWith('/AnchoredMenu')) return {AnchoredMenu:'AnchoredMenu',useAnchoredMenu:()=>({triggerRef:{current:null},anchor:null,open(){},close(){}})};
    if (id.endsWith('.json')) return {title:'MoneyPlan'};
    return new Proxy({}, {get:(_target,key)=>key});
  };
  const module = { exports:{} };
  const compiled = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`,{filename:file})(requireMock,module,module.exports);
  return {state,events,render:(name,props={})=>{cursor=0;refCursor=0;return module.exports[name](props);}};
}
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node,'Expected rendered action'); return node; };
const hasAlert = (h,kind,message) => h.events.some(e=>e.kind===kind&&e.message===message);
async function click(tree,label){find(tree,n=>n.props?.label===label).props.onPress();await settle();}
(async()=>{
  // SDK 58 redirects focused hidden tabs. Exercise the installed router's
  // processing and redirect hook against the actual MoneyPlan layout.
  {
    const Tabs = Object.assign(() => null, { Screen: 'TabScreen' });
    const h = harness('app/(budget)/_layout.tsx', {}, {
      'expo-router': { Tabs, useRouter: () => ({}) },
      '../../src/hub/tabs': { BUDGET_TABS: [{ id: 'index', labelKey: 'navDashboard' }] },
      budget: { loadSavingsGoal: async () => ({ goal_amount: 0 }), loadBudget: async () => null },
    });
    const tree = h.render('default');
    const tabs = find(tree, n => n.type === Tabs);
    const options = focused => tabs.props.screenOptions({ navigation: { isFocused: () => focused } });
    const sample = (focused, value) => options(focused).sceneStyleInterpolator({ current: { progress: {
      interpolate({ inputRange, outputRange }) {
        const clamped = Math.max(inputRange[0], Math.min(inputRange.at(-1), value));
        const index = clamped <= 0 ? 0 : 1;
        const fraction = (clamped - inputRange[index]) / (inputRange[index + 1] - inputRange[index]);
        return outputRange[index] + fraction * (outputRange[index + 1] - outputRange[index]);
      },
    } } }).sceneStyle;
    assert.equal(options(true).sceneStyle.backgroundColor, colors.background, 'Scenes use the current theme');
    assert.equal(options(true).transitionSpec.config.duration, 200, 'Tab switches finish quickly');
    for (const direction of [-1, 1]) {
      const entering = sample(true, direction);
      const departing = sample(false, direction);
      assert.equal(entering.transform[0].translateX, direction * 16, 'Movement stays subtle in either direction');
      assert.deepEqual(departing, entering, 'Focus changes never swap the animation path during a switch');
      assert.equal(entering.opacity, 0, 'Inactive scenes fade away');
      assert.equal(entering.transform.length, 1, 'No screen scaling is applied');
      assert.equal(entering.borderRadius, undefined, 'No animated corner clipping is applied');
      const midway = sample(true, direction / 2);
      assert.equal(midway.transform[0].translateX, direction * 8, 'Position changes continuously');
      assert.equal(midway.opacity, 0.5, 'Opacity changes continuously');
      assert.deepEqual(sample(true, direction * 2), entering, 'Interrupted transitions stay within their bounds');
    }
    const settled = sample(true, 0);
    assert.equal(settled.transform[0].translateX, 0);
    assert.equal(settled.opacity, 1, 'Active pages remain fully visible');
    const reduced = harness('app/(budget)/_layout.tsx', {}, {
      'expo-router': { Tabs, useRouter: () => ({}) },
      'react-native-reanimated': { useReducedMotion: () => true },
      budget: { loadSavingsGoal: async () => ({ goal_amount: 0 }), loadBudget: async () => null },
    });
    const reducedTabs = find(reduced.render('default'), n => n.type === Tabs);
    const reducedOptions = reducedTabs.props.screenOptions({ navigation: { isFocused: () => true } });
    assert.equal(reducedOptions.animation, 'none');
    assert.equal(reducedOptions.transitionSpec.config.duration, 0, 'Reduced motion also disables the explicit transition timing');
    assert.equal(reducedOptions.sceneStyleInterpolator, undefined);
    const screens = nodes(tree).filter(n => n.type === 'TabScreen').map(n => n.props);
    const routerRoot = path.dirname(require.resolve('expo-router/package.json'));
    function sdkModule(file, mocks) {
      const module = { exports: {} };
      vm.runInNewContext(fs.readFileSync(path.join(routerRoot, 'build', file), 'utf8'), {
        module, exports: module.exports, __DEV__: false,
        require: id => mocks[id] ?? {},
      }, { filename: file });
      return module.exports;
    }
    const config = sdkModule('layouts/TabsClient.js', {
      '../standard-navigation': { integrateWithRouter: (_navigator, _router, config) => config },
    }).default;
    const processed = config.processScreens(screens);
    const routes = processed.map(screen => ({ key: screen.name, name: screen.name }));
    const redirects = [];
    const { useVisibleTabsWithRedirect } = sdkModule('standard-navigation/useVisibleTabsWithRedirect.js', {
      react: { useMemo: fn => fn(), useEffect: fn => fn() },
      '../Route': { useRouteNode: () => ({}) },
      '../global-state/useRouterActions': { useRouterActions: () => ({ replace: href => redirects.push(href) }) },
      '../layouts/GuardContext': { useGuardRedirect: () => undefined },
      '../link/preview/PreviewRouteContext': { useIsPreview: () => false },
      '../react-navigation/native': { useIsFocused: () => true },
      '../routeNode': { getValidInitialRouteName: () => 'index' },
      '../utils/orderRoutesByRouteNames': { orderRoutesByRouteNames: routes => routes },
      './useBuildHref': { useBuildHref: () => route => route.name },
    });
    const descriptors = Object.fromEntries(processed.map(screen => [screen.name, { routeSource: 'layout', options: screen.options }]));
    const args = { routes, routeNames: routes.map(route => route.name), focusedRouteKey: 'budget', descriptors };
    assert.ok(useVisibleTabsWithRedirect(args).focusedIndex >= 0, 'Budget month must remain reachable');
    assert.deepEqual(redirects, [], 'Opening a month must not redirect to Dashboard');
    // Control: the previous href:null configuration reproduces the report.
    const hidden = config.processScreens([{ name: 'budget', options: { href: null } }])[0];
    useVisibleTabsWithRedirect({ ...args, descriptors: { ...descriptors, budget: { routeSource: 'layout', options: hidden.options } } });
    assert.deepEqual(redirects, ['index']);
  }
  for (const month of ['2026-10', '2026-11', '2026-12']) {
    const opened = [];
    const h = harness('app/(budget)/index.tsx', { loadState: 'ready', summaries: [{ month }], creatingMonth: month }, {
      'expo-router': { useFocusEffect() {}, useRouter: () => ({ push: href => opened.push(href) }) },
      budget: { createBudgetMonth: async () => ({ created: true }), loadLoans: async () => ({}), listMonthSummaries: async () => [] },
      savings: { getSavingsSummary: async () => ({ balance: 0 }) },
    });
    const tree = h.render('default');
    const list = find(tree, n => n.type === 'FlatList');
    const card = month === '2026-11' ? find(tree, n => n.type === 'BudgetMonthCard') : list.props.renderItem({ item: { month } });
    card.props.onOpen();
    await find(tree, n => n.type === 'BudgetMonthEditor').props.onSave(month, 1000, 100);
    assert.deepEqual(opened, [`/(budget)/budget?month=${month}`, `/(budget)/budget?month=${month}`], 'Existing and newly saved plans open the selected month');
  }
  // Every native modal owns an alert host; a root-only host is hidden on Android.
  const componentRoot=path.join(root,'src/components');
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  let modalCount=0;
  for(const file of walk(componentRoot).filter(f=>f.endsWith('.tsx'))){
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node){
      if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='Modal'){
        modalCount++;
        let host=false;function scan(child){if(ts.isJsxSelfClosingElement(child)&&child.tagName.getText(ast)==='AppAlerts')host=true;ts.forEachChild(child,scan);}scan(node);
        assert.ok(host,`${path.relative(root,file)} must render alerts inside its native Modal`);
      }
      ts.forEachChild(node,visit);
    }visit(ast);
  }
  assert.ok(modalCount >= 5);
  const alertHost=harness('src/components/AppAlerts.tsx');const config=alertHost.render('AppAlerts').props;
  assert.equal(config.position,'top-center');assert.equal(config.offset,32);assert.equal(config.duration,1000);assert.equal(config.fullWindowOverlay,false);
  assert.equal(config.closeButton,false);assert.equal(config.ToastWrapper({toastId:1}).props.accessibilityLiveRegion,'polite');
  for(const visible of [true,false]){
    const h=harness('src/components/ui/FormDialog.tsx');const tree=h.render('FormDialog',{title:'Test',visible,onClose(){},children:null});
    assert.equal(nodes(tree).filter(n=>n.type==='AppAlerts').length,visible?1:0);
  }
  const confirm=harness('src/components/ConfirmDialog.tsx');const confirmTree=confirm.render('ConfirmDialog',{visible:true,title:'Delete',message:'Test',onClose(){},onConfirm:async()=>{throw Error('write failed');}});
  const confirmButton=find(confirmTree,n=>n.props?.accessibilityLabel==='confirm');confirmButton.props.onPress();await settle();
  assert.ok(hasAlert(confirm,'error','saveFailed'));assert.equal(confirm.state.isConfirming,false);
  // Savings operations announce only persisted success; invalid input stays inline.
  for(const formType of ['deposit','purchase']){
    const h=harness('app/(budget)/savings.tsx',{showModal:true,formType,formAmount:'12.50',formDate:'2026-11-01'},{savings:{addTransaction:async()=>{}}});
    await click(h.render('default'),'save');assert.ok(hasAlert(h,'success',formType==='deposit'?'depositAdded':'withdrawalAdded'));assert.equal(h.state.showModal,false);
  }
  const failed=harness('app/(budget)/savings.tsx',{showModal:true,formAmount:'12.50',formDate:'2026-11-01'},{savings:{addTransaction:async()=>{throw Error('disk full');}}});
  await click(failed.render('default'),'save');assert.ok(hasAlert(failed,'error','errorAddingSavings'));assert.equal(failed.state.showModal,true);assert.ok(!failed.events.some(e=>e.kind==='success'));
  const invalid=harness('app/(budget)/savings.tsx',{showModal:true,formAmount:'0',formDate:'2026-11-01'});await click(invalid.render('default'),'save');assert.equal(invalid.state.modalError,'savingsErrorAmount');assert.equal(invalid.events.length,0);
  for(const kind of ['tx','auto'])for(const fail of [false,true]){
    const operation=async()=>{if(fail)throw Error('disk full');};
    const h=harness('app/(budget)/savings.tsx',{showModal:true,editingId:1,editingKind:kind,editingMonth:'2026-11',formAmount:'25',formDate:'2026-11-01'},{savings:{updateTransaction:operation,updateAutoDeposit:operation,deleteTransaction:operation,deleteAutoDeposit:operation}});
    const tree=h.render('default');await click(tree,'save');assert.ok(hasAlert(h,fail?'error':'success',fail?'errorUpdatingSavings':'savingsEntryUpdated'));
    h.events.length=0;find(tree,n=>n.props?.accessibilityLabel==='delete').props.onPress();await h.state.confirmAction.onConfirm();
    assert.ok(hasAlert(h,fail?'error':'success',fail?'errorDeletingSavings':'savingsEntryDeleted'));
  }
  for(const result of [{created:true},{created:false},{blockedYear:2024},null]){
    const entry={id:'tx-1',kind:'tx',type:'deposit',date:'2025-11-01',description:'Savings',amount:25,rawTx:{id:1,description:'Savings'}};
    const h=harness('app/(budget)/savings.tsx',{entries:[entry],closeYearOpen:true,closingYear:2025},{savings:{previewClosingBalance:async()=>25,closeYear:async()=>{if(!result)throw Error('disk full');return result;}}});
    await click(h.render('default'),'closeYearLabel');assert.ok(h.state.confirmAction);await h.state.confirmAction.onConfirm();
    assert.ok(hasAlert(h,!result?'error':result.blockedYear?'warning':result.created?'success':'info',!result?'errorAddingSavings':result.blockedYear?'closeYearBlocked':result.created?'yearClosed':'closeYearNothing'));
  }
  for(const fail of [false,true]){
    const h=harness('app/(budget)/loans.tsx',{draft:{name:'Loan',kind:'loan',amount:100,payment:10,term:10,startMonth:'2026-11'}},{repayments:{saveRepaymentPlan:async()=>{if(fail)throw Error('disk full');return {id:1};}}});
    await click(h.render('default'),'save');assert.ok(hasAlert(h,fail?'error':'success',fail?'paymentPlanSaveFailed':'repaymentSaved'));if(fail)assert.ok(h.state.draft);else assert.equal(h.state.draft,null);
  }
  {
    let saves=0;
    const h=harness('app/(budget)/loans.tsx',{draft:{name:'Loan',kind:'loan',amount:100,payment:10,term:10,startMonth:'2026-11'},invalidFields:new Set(['amount'])},{repayments:{saveRepaymentPlan:async()=>{saves++;}}});
    const tree=h.render('default');
    assert.equal(find(tree,n=>n.props?.label==='save').props.disabled,true,'Visible invalid numeric input disables saving');
    await click(tree,'save');
    assert.equal(saves,0,'A stale valid value cannot be saved behind invalid input');
    assert.ok(hasAlert(h,'error','paymentPlanInvalid'));
  }
  {
    const changes=[],validity=[];
    const h=harness('src/components/NumberInput.tsx',{}, {'../lib/numberInput':{parseNumberInput:text=>/^\d+$/.test(text)?Number(text):null}});
    const tree=h.render('NumberInput',{value:25,onChange:value=>changes.push(value),onValidityChange:valid=>validity.push(valid)});
    const input=find(tree,n=>n.type==='TextInput');
    input.props.onChangeText('25x');input.props.onChangeText('30');
    assert.deepEqual(changes,[30]);assert.deepEqual(validity,[false,true],'Numeric inputs report both invalid and corrected values');
  }
  for(const fail of [false,true]){
    const budget={id:1,month:'2026-11',income:2400,savings_goal:300};
    const h=harness('app/(budget)/budget.tsx',{budget,loans:{},loading:false,expenseEditor:{}},{budget:{saveExpenseDraft:async(_id,fields)=>{if(fail)throw Error('disk full');return{id:1,budget_id:1,...fields};}}});
    const editor=find(h.render('default'),n=>n.type==='ExpenseEditor');const save=editor.props.onSave({category:'Groceries',amount:25,paid:false,is_recurring:false});
    if(fail){await assert.rejects(save);assert.equal(h.events.length,0);}else{await save;assert.ok(hasAlert(h,'success','expenseAdded'));}
  }
  // Expense paid/recurring toggles and month edits use actual persisted outcomes.
  const sample={id:1,budget_id:1,category:'Groceries',amount:25,paid:false,is_recurring:false};
  // Completing a row must never move another checkbox under the user's finger.
  // Exercise the actual screen and rerender after each persisted toggle.
  {
    const bills = [sample, {...sample,id:2,category:'Rent'}, {...sample,id:3,category:'Electricity'}];
    const plans = [{id:9,name:'Card',kind:'card',payment:25}, {id:7,name:'Loan',kind:'loan',payment:50}];
    const writes = [], paymentWrites = [];
    const h = harness('app/(budget)/budget.tsx', {budget:{id:1,month:'2026-11'},loans:{},loading:false,expenses:bills,repayments:plans}, {
      budget:{updateExpense:async(id,fields)=>writes.push({id,...fields})},
      repayments:{repaymentForMonth:()=>25,setRepaymentPaid:async(id,month,paid)=>{paymentWrites.push({id,month,paid});return plans.find(plan=>plan.id===id);}},
    });
    const list = () => find(h.render('default'),n=>n.type==='FlatList');
    const rows = () => nodes(h.render('default')).filter(n=>n.type==='RepaymentPaymentSection');
    const expectedPaid = new Map(bills.map(expense=>[expense.id,false]));
    const expectedPlans = new Set();
    for (const id of [1,2,1,3,2]) {
      const before = list();
      const item = before.props.data.find(expense=>expense.id===id);
      const row = find(before.props.renderItem({item,index:before.props.data.indexOf(item)}),n=>n.type==='CustomExpenseRow');
      await row.props.onUpdate(id,{paid:!item.paid});
      expectedPaid.set(id,!item.paid);
      assert.deepEqual(list().props.data.map(expense=>expense.id),[1,2,3],'Expense positions stay fixed after paid/unpaid toggles');
      assert.equal(writes.at(-1).id,id,'Only the tapped expense is persisted');
      assert.deepEqual(h.state.expenses.map(expense=>[expense.id,expense.paid]),[...expectedPaid],'Other expense paid flags remain unchanged');
    }
    for (const id of [9,7,9]) {
      rows().find(row=>row.props.plan.id===id).props.onToggle(); await settle();
      if(expectedPlans.has(id)) expectedPlans.delete(id); else expectedPlans.add(id);
      assert.deepEqual(rows().map(row=>row.props.plan.id),[9,7],'Loan/card positions stay fixed after paid/unpaid toggles');
      assert.deepEqual(paymentWrites.at(-1),{id,month:'2026-11',paid:expectedPlans.has(id)});
      assert.deepEqual([...h.state.paidRepayments],[...expectedPlans],'Other loan/card paid flags remain unchanged');
    }
    for (const filter of ['paid','unpaid']) {
      find(h.render('default'),n=>n.type==='Pressable'&&n.props.children?.props?.children===filter).props.onPress();
      const expected = h.state.expenses.filter(expense=>expense.paid===(filter==='paid')).map(expense=>expense.id);
      assert.deepEqual(list().props.data.map(expense=>expense.id),expected,'Explicit payment filters preserve record order');
    }
  }
  {
    const seeded={...sample,id:9,is_recurring:true};
    const h=harness('app/(budget)/budget.tsx',{budget:{id:0,month:'2026-11'},loans:{},loading:false,expenseEditor:{}},{budget:{createBudgetMonth:async()=>({budget:{id:1,month:'2026-11',savings_goal:0}}),listExpenses:async()=>[seeded],saveExpenseDraft:async(_id,fields)=>({...fields,id:10,budget_id:1})}});
    const editor=find(h.render('default'),n=>n.type==='ExpenseEditor');
    await editor.props.onSave({category:'New bill',amount:12,paid:false,is_recurring:false});
    assert.deepEqual(h.state.expenses.map(e=>e.id),[9,10],'Creating a month from detail keeps seeded recurring expenses visible');
  }
  {
    const h=harness('app/(budget)/budget.tsx',{budget:{id:1,month:'2026-10'},loans:{},loading:false,loadError:'errorLoadingData'});
    const tree=h.render('default');
    assert.ok(nodes(tree).some(n=>n.props?.children==='retry'),'A failed reload offers Retry even when old budget state exists');
    assert.ok(!nodes(tree).some(n=>n.type==='FlatList'),'A failed month reload must not show stale editable data');
  }
  for(const fail of [false,true]){
    const budget={id:1,month:'2026-11',income:2400,savings_goal:300};
    const h=harness('app/(budget)/budget.tsx',{budget,loans:{},loading:false,expenses:[sample],editingMonth:true},{budget:{updateExpense:async()=>{if(fail)throw Error('disk full');},setExpenseRecurring:async()=>{if(fail)throw Error('disk full');},saveMonthPreferences:async()=>{if(fail)throw Error('disk full');},loadLoans:async()=>({}),loadBudget:async()=>budget,loadSavingsGoal:async()=>({goal_amount:300}),listExpenses:async()=>[sample]},repayments:{listRepaymentPlans:async()=>[],paidRepaymentIds:async()=>new Set()}});
    const tree=h.render('default'),list=find(tree,n=>n.type==='FlatList'),row=find(list.props.renderItem({item:sample,index:0}),n=>n.type==='CustomExpenseRow');
    await row.props.onUpdate(1,{paid:true});assert.ok(hasAlert(h,fail?'error':'success',fail?'errorUpdatingExpense':'paymentMarkedPaid'));assert.equal(h.state.expenses[0].paid,!fail);
    await row.props.onToggleRecurring(sample,true);assert.ok(hasAlert(h,fail?'error':'success',fail?'errorUpdatingExpense':'recurringEnabled'));
    const editor=find(tree,n=>n.type==='BudgetMonthEditor');
    if(fail)await assert.rejects(editor.props.onSave('2026-11',2400,300));else{await editor.props.onSave('2026-11',2400,300);assert.ok(hasAlert(h,'success','monthSaved'));}
  }
  for(const fail of [false,true]){
    const h=harness('app/(budget)/loans.tsx',{deletingId:1},{repayments:{removeRepaymentPlan:async()=>{if(fail)throw Error('disk full');}}});
    await find(h.render('default'),n=>n.type==='ConfirmDialog'&&n.props.title==='paymentPlanDeleteTitle').props.onConfirm();
    assert.ok(hasAlert(h,fail?'error':'success',fail?'paymentPlanDeleteFailed':'repaymentDeleted'));
  }
  for(const fail of [false,true]){
    const budget={id:1,month:'2026-11',income:2400,savings_goal:300};
    const h=harness('app/(budget)/budget.tsx',{budget,budgetIdRef:1,loans:{},loading:false,expenses:[sample],expenseToDelete:sample},{budget:{removeExpenseWithUndo:async()=>{if(fail)throw Error('disk full');return {expense:sample,month:'2026-11',templates:[]};},restoreDeletedExpense:async()=>sample}});
    await find(h.render('default'),n=>n.type==='ConfirmDialog'&&n.props.title==='expenseDeleteTitle').props.onConfirm();
    if(fail){assert.ok(hasAlert(h,'error','errorRemovingExpense'));assert.equal(h.state.expenses.length,1);}
    else{const undo=h.events.find(e=>e.message==='expenseDeleted');assert.ok(undo);assert.equal(undo.options.duration,10000);assert.equal(h.state.expenses.length,0);undo.options.action.onClick();await settle();assert.ok(hasAlert(h,'success','expenseRestored'));assert.equal(h.state.expenses[0].id,1);}
  }
  for(const fail of [false,true]){
    const plan={id:1,name:'Loan',kind:'loan',payment:25};
    const h=harness('app/(budget)/budget.tsx',{budget:{id:1,month:'2026-11'},loans:{},loading:false,repayments:[plan]},{repayments:{repaymentForMonth:()=>25,setRepaymentPaid:async()=>{if(fail)throw Error('disk full');return plan;}}});
    find(h.render('default'),n=>n.type==='RepaymentPaymentSection').props.onToggle();await settle();
    assert.ok(hasAlert(h,fail?'error':'success',fail?'errorUpdatingLoan':'paymentMarkedPaid'));
  }
  for(const fail of [false,true]){
    const h=harness('app/(budget)/index.tsx',{monthToDelete:'2026-11'}, {'../../src/lib/db':{withTransaction:async fn=>fn({})},budget:{loadBudget:async()=>({id:1}),deleteBudget:async()=>{if(fail)throw Error('disk full');},loadLoans:async()=>({}),listMonthSummaries:async()=>[]},savings:{getSavingsSummary:async()=>({balance:0})}});
    await find(h.render('default'),n=>n.type==='ConfirmDialog'&&n.props.title==='deleteConfirmTitle').props.onConfirm();
    assert.ok(hasAlert(h,fail?'error':'success',fail?'errorDeletingBudget':'monthDeleted'));
  }
  for(const outcome of ['success','cancel','error']){
    const h=harness('src/components/SettingsScreen.tsx',{passwordAction:'folder'}, {'../lib/backup':{hasSafetyBackup:()=>false,exportBackupToDirectory:async password=>{assert.equal(password,'private backup password');if(outcome==='error')throw Error('No space left');return outcome==='cancel'?null:'backup.json';}}});
    const action=find(h.render('default'),n=>n.type==='BackupPasswordDialog').props.onSubmit('private backup password');
    if(outcome==='error') { await assert.rejects(action,/No space left/); assert.equal(h.state.busy,false); continue; }
    await action;
    if(outcome==='cancel')assert.equal(h.events.length,0);
    else if(outcome==='success')assert.ok(hasAlert(h,'success','Backup saved'));
  }
  {
    const h=harness('src/components/BackupPasswordDialog.tsx',{password:'private backup password',confirmation:'private backup password'});
    const tree=h.render('BackupPasswordDialog',{creating:true,onClose(){},onSubmit:async()=>{throw Error('No space left');}});
    await click(tree,'Continue');
    assert.equal(h.state.error,'No space left'); assert.ok(hasAlert(h,'error','Could not save backup.')); assert.equal(h.state.busy,false);
  }
  for (const confirmation of ['short', 'different backup password']) {
    let exports=0;
    const h=harness('src/components/BackupPasswordDialog.tsx',{password:'private backup password',confirmation});
    const tree=h.render('BackupPasswordDialog',{creating:true,onClose(){},onSubmit:async()=>{exports++;}});
    assert.equal(find(tree,n=>n.props?.label==='Continue').props.disabled,true);
    await click(tree,'Continue'); assert.equal(exports,0,'Mismatched passwords cannot create an unrecoverable backup');
  }
  {
    let imported=0;
    const h=harness('src/components/SettingsScreen.tsx',{passwordAction:'unlock',encryptedFile:'protected'}, {'../lib/backup':{hasSafetyBackup:()=>false,previewBackup:()=> 'Verified',importBackup:async()=>{imported++;}},'../lib/backupCrypto':{decryptBackup:async()=>'{"meta":{}}'}});
    await find(h.render('default'),n=>n.type==='BackupPasswordDialog').props.onSubmit('private backup password');
    assert.ok(h.state.pending,'Unlocked data still requires import confirmation'); assert.equal(imported,0); assert.equal(h.state.encryptedFile,null);
  }
  for(const restored of [true,false]){
    const h=harness('src/components/SettingsScreen.tsx',{pending:{json:'{}',summary:'Backup'}},{'../lib/backup':{hasSafetyBackup:()=>false,importBackup:async()=>({preferencesRestored:restored}),buildBackupEnvelope:async()=>({}),previewBackup:()=> 'Verified'}});
    await find(h.render('default'),n=>n.type==='ConfirmDialog'&&n.props.title==='Import MoneyPlan data?').props.onConfirm();
    assert.ok(hasAlert(h,restored?'success':'warning',restored?'Backup imported':'Data imported. Check appearance settings.'));assert.equal(h.state.pending,null);
  }
  for(const status of ['up-to-date','no-releases','error','update']){
    const h=harness('src/components/UpdateCard.tsx',{}, {'../lib/UpdateContext':{useUpdate:()=>({hasUpdate:false,latest:null,currentVersion:'1.0.0',checking:false,result:null,refresh:async()=>({status,latest:{versionName:'1.1.0'}})})}});
    find(h.render('UpdateCard'),n=>n.props?.accessibilityLabel==='checkForUpdates').props.onPress();await settle();
    const [kind,message]={ 'up-to-date':['success','updateUpToDate'],'no-releases':['info','updateNoReleases'],error:['error','updateCheckFailed'],update:['success','updateAvailableToast']}[status];
    assert.ok(hasAlert(h,kind,message));
  }
  console.log(`Alert and navigation checks passed: SDK tab redirects, existing/new month navigation, ${modalCount} native modal hosts, safe top placement, 1-second timing, accessibility, dialog errors, savings add/edit/delete/year-close, expense saves/paid/recurring, fixed expense and loan/card positions across toggles and filters, budget edits, repayment save/delete, backup save/cancel/failure/import, and update-check outcomes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
