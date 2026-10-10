// Exercise the actual editor handlers with delayed writes and stale render state.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

module.exports = async function verifyLoanEditor(root) {
  const filename = path.join(root, 'app/(budget)/loans.tsx');
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['save', 'start', 'edit', 'update', 'dismissDraft', 'closeDraft'].includes(node.name.getText(ast))) {
      handlers[node.name.getText(ast)] = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let finish;
  let writes = 0;
  let records = [];
  const errors = [];
  const draft = { name: 'Home', kind: 'loan', payment: 100 };
  const context = {
    draft, saving: false, editingId: null, operationRef: { current: false }, readRequestRef: { current: 0 },
    isValidRepaymentInput: () => true,
    setSaving() {}, // Deliberately do not rerender: the ref must protect rapid taps.
    saveRepaymentPlan: async input => {
      writes++;
      await new Promise((resolve, reject) => { finish = error => error ? reject(error) : resolve(); });
      return { ...input, id: writes };
    },
    setPlans: fn => { records = fn(records); },
    setDraft: value => { context.draft = typeof value === 'function' ? value(context.draft) : value; },
    setEditingId: value => { context.editingId = value; },
    setChoosingMonth() {}, setDiscard(value) { context.discard = value; },
    setStartMonthTouched() {}, initialDraft: { current: "" },
    listRef: { current: null }, haptics: { success: async () => {}, light: async () => {} },
    toast: { error: message => errors.push(message) }, t: key => key,
    emptyPlan: kind => ({ kind, name: '' }),
  };
  vm.createContext(context);
  for (const [name, handler] of Object.entries(handlers)) {
    const js = ts.transpileModule(`globalThis.${name} = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(js, context, { filename });
  }
  const pending = context.save();
  await context.save();
  context.start('card');
  context.edit({ id: 9, name: 'Other' });
  context.update({ name: 'Changed' });
  assert.equal(writes, 1);
  assert.equal(context.draft, draft, 'An in-flight write must lock new drafts and edits');
  finish();
  await pending;
  assert.equal(records.length, 1);
  assert.equal(context.draft, null, 'A successful save closes the draft without another database read');
  assert.equal(context.operationRef.current, false);
  context.start('loan');
  const failedDraft = context.draft;
  const failed = context.save();
  finish(new Error('Write failed'));
  await failed;
  assert.equal(context.draft, failedDraft, 'A failed write retains the draft for retry');
  assert.equal(context.operationRef.current, false);
  assert.deepEqual(errors, ['paymentPlanSaveFailed']);
  context.start('loan'); context.closeDraft();
  assert.equal(context.draft, null, 'An unchanged loan draft closes directly');
  context.start('loan'); context.update({ name: 'Changed' }); context.closeDraft();
  assert.equal(context.discard, true, 'A changed loan draft requires discard confirmation');
  assert.equal(context.draft.name, 'Changed');
  context.dismissDraft(); assert.equal(context.draft, null); assert.equal(context.discard, false);
};
