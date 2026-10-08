// Verify actual font glyphs, Android resources, and compiled NativeWind rules.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { cssToReactNativeRuntime } = require('react-native-css-interop/css-to-rn');

function fontTable(buffer, name) {
  for (let i = 0; i < buffer.readUInt16BE(4); i++) {
    const entry = 12 + i * 16;
    if (buffer.toString('ascii', entry, entry + 4) === name) return buffer.readUInt32BE(entry + 8);
  }
  throw new Error(`Missing TTF table ${name}`);
}

function hasGlyph(buffer, code) {
  const cmap = fontTable(buffer, 'cmap');
  for (let i = 0; i < buffer.readUInt16BE(cmap + 2); i++) {
    const record = cmap + 4 + i * 8;
    const platform = buffer.readUInt16BE(record);
    const encoding = buffer.readUInt16BE(record + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue;
    const sub = cmap + buffer.readUInt32BE(record + 4);
    const format = buffer.readUInt16BE(sub);
    if (format === 12) {
      for (let j = 0; j < buffer.readUInt32BE(sub + 12); j++) {
        const group = sub + 16 + j * 12;
        const start = buffer.readUInt32BE(group);
        const end = buffer.readUInt32BE(group + 4);
        if (code >= start && code <= end && buffer.readUInt32BE(group + 8) + code - start !== 0) return true;
      }
    } else if (format === 4 && code <= 65535) {
      const count = buffer.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + count * 2 + 2;
      const deltas = starts + count * 2;
      const offsets = deltas + count * 2;
      for (let j = 0; j < count; j++) {
        const start = buffer.readUInt16BE(starts + j * 2);
        if (code < start || code > buffer.readUInt16BE(ends + j * 2)) continue;
        const delta = buffer.readInt16BE(deltas + j * 2);
        const offset = buffer.readUInt16BE(offsets + j * 2);
        let glyph = offset ? buffer.readUInt16BE(offsets + j * 2 + offset + 2 * (code - start)) : code;
        if (!offset || glyph) glyph = (glyph + delta) & 65535;
        if (glyph) return true;
      }
    }
  }
  return false;
}

async function main() {
  const config = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const plugin = config.expo.plugins.find(item => Array.isArray(item) && item[0] === 'expo-font')[1];
  const { toValidAndroidResourceName } = require(path.join(path.dirname(require.resolve('expo-font/package.json')), 'plugin/build/utils.js'));
  const definitions = plugin.android.fonts[0].fontDefinitions;
  assert.equal(plugin.android.fonts[0].fontFamily, 'Urbanist');
  const xml = fs.readFileSync('android/app/src/main/res/font/xml_urbanist.xml', 'utf8');
  const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 €$%.,:;!?()[]+-/ ·–—“”’ëËçÇ';
  for (const definition of definitions) {
    const buffer = fs.readFileSync(definition.path);
    assert.equal(buffer.readUInt16BE(fontTable(buffer, 'OS/2') + 4), definition.weight);
    for (const char of text) assert.ok(hasGlyph(buffer, char.codePointAt(0)), `${definition.path} missing ${char}`);
    const resource = toValidAndroidResourceName(definition.path);
    assert.deepEqual(fs.readFileSync(path.join('android/app/src/main/res/font', resource + '.ttf')), buffer);
    assert.ok(xml.includes(`app:font="@font/${resource}" app:fontStyle="normal" app:fontWeight="${definition.weight}"`));
  }
  const icons = fs.readFileSync('assets/fonts/uicons-regular-rounded.ttf');
  const ast = ts.createSourceFile('uicons.ts', fs.readFileSync('src/constants/uicons.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const initializer = ast.statements[0].declarationList.declarations[0].initializer;
  const glyphs = ts.isAsExpression(initializer) ? initializer.expression : initializer;
  for (const property of glyphs.properties) assert.ok(hasGlyph(icons, property.initializer.text.codePointAt(0)), `Missing icon ${property.name.text}`);
  assert.match(fs.readFileSync('android/app/src/main/java/com/uranik/offlinehub/MainApplication.kt', 'utf8'), /addCustomFont\(this, "Urbanist", R\.font\.xml_urbanist\)/);
  const css = (await postcss([tailwind(require('../tailwind.config.js'))]).process(fs.readFileSync('global.css', 'utf8'), { from: 'global.css' })).css;
  const rules = cssToReactNativeRuntime(css, { inlineRem: 14 }).rules;
  for (const [className, family] of [['font-sans', 'Urbanist-Regular'], ['font-medium', 'Urbanist-Medium'], ['font-semibold', 'Urbanist-SemiBold'], ['font-bold', 'Urbanist-Bold']]) {
    const compiled = JSON.stringify(rules[className]);
    assert.ok(compiled.includes(`"fontFamily":"${family}"`), `Native rule missing ${className}`);
    if (className !== 'font-sans') assert.ok(compiled.includes('"fontWeight":"normal"'), `${className} must avoid Android weight fallback`);
  }
  console.log(`Passed: 4 font weights and native resources, common text glyphs, ${glyphs.properties.length} icons, and compiled Android font rules. Device appearance requires a connected phone.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
