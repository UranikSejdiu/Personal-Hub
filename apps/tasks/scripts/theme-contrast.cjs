const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the real, dependency-free theme module using the project's compiler,
// as the existing data regression harness does for the domain modules.
const filename = path.resolve(__dirname, '../src/constants/theme.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const themeModule = { exports: {} };
vm.runInNewContext(compiled, { module: themeModule, exports: themeModule.exports }, { filename });
const { getThemeColors, getThemeVariables } = themeModule.exports;

// WCAG relative luminance; verify the actual tokens, including tinted selections.
function rgb(color) {
  const match = /^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(color);
  assert.ok(match, `Invalid theme color: ${color}`);
  const hue = Number(match[1]) / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  assert.ok(hue >= 0 && hue <= 1 && saturation >= 0 && saturation <= 1 && lightness >= 0 && lightness <= 1);
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map((offset) => {
    const k = (offset + hue * 12) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}

function luminance(channels) {
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

let checked = 0;
for (const theme of ["light", "dark"]) {
    const colors = getThemeColors(theme);
    for (const value of Object.values(colors)) rgb(value);
    const pairs = [];
    for (const background of ["background", "card", "surface", "muted"]) {
      for (const foreground of ["foreground", "mutedForeground", "primary", "success", "destructive"]) {
        pairs.push([`${foreground} on ${background}`, rgb(colors[foreground]), rgb(colors[background])]);
      }
    }
    for (const background of ["primary", "secondary", "success", "destructive"]) {
      pairs.push([`${background} button`, rgb(colors[`${background}Foreground`]), rgb(colors[background])]);
    }
    for (const key of ["chart1", "chart2", "chart3", "chart4", "chart5"]) {
      pairs.push([`${key} label`, rgb(colors[key]), rgb(colors.card)]);
    }
    const primary = rgb(colors.primary);
    const card = rgb(colors.card);
    pairs.push(["selected tab", primary, primary.map((value, i) => value * 0.1 + card[i] * 0.9)]);
    for (const [label, foreground, background] of pairs) {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${theme}: ${label} contrast ${ratio.toFixed(2)} is below 4.5`);
      checked += 1;
    }
    const variables = getThemeVariables(colors);
    assert.ok(variables["--card-foreground"] && variables["--primary-foreground"] && variables["--chart-1"]);
    assert.equal(variables["--primary"], colors.primary.slice(4, -1).replace(/,\s*/g, " "));
}
console.log(`Theme contrast passed: ${checked} text pairs across light and dark mode.`);
