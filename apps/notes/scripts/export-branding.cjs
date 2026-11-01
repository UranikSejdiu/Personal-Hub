// Editable vector artwork and deterministic PNG exports for My Notes.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const output = path.resolve(__dirname, '../assets/branding');
const graphite = '#252824', ivory = '#faf8ef', sage = '#b4c4a9';
const back = '<g transform="rotate(10 512 512)"><rect x="350" y="268" width="344" height="490" rx="48"/></g>';
const front = '<rect x="306" y="250" width="352" height="500" rx="48"/>';
const ink = '<path d="M380 442H574M380 510H526M380 578H548" fill="none" stroke-width="23" stroke-linecap="round"/>';
const bookmark = '<path d="M558 250H604V390L581 373 558 390Z"/>';
function coloredMark() {
  return `<g fill="${sage}">${back}</g><g transform="rotate(-7 512 512)"><g fill="${ivory}">${front}</g><path d="M351 312V684" stroke="#dddfd5" stroke-width="8" stroke-linecap="round"/><g fill="${sage}">${bookmark}</g><g stroke="${graphite}">${ink}</g></g>`;
}
function monoMark(color) {
  return `<defs><mask id="notebook"><rect width="1024" height="1024" fill="black"/><g fill="white">${back}</g><g transform="rotate(-7 512 512)"><g fill="white" stroke="black" stroke-width="22">${front}</g><g stroke="black">${ink}</g><g fill="black">${bookmark}</g></g></mask></defs><rect width="1024" height="1024" fill="${color}" mask="url(#notebook)"/>`;
}
function svg(mark, background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}${mark}</svg>`;
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  const exports = [
    ['icon', coloredMark(), graphite, 1024],
    ['store-icon', coloredMark(), graphite, 512],
    ['adaptive-foreground', coloredMark(), null, 1024],
    ['monochrome', monoMark('#ffffff'), null, 1024],
    ['logo-light', monoMark(graphite), null, 1024],
    ['logo-dark', monoMark(ivory), null, 1024],
    ['splash-light', monoMark(graphite), null, 512],
    ['splash-dark', monoMark(ivory), null, 512],
  ];
  for (const [name, mark, background, size] of exports) {
    const source = svg(mark, background);
    await fs.writeFile(path.join(output, `${name}.svg`), source);
    await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(output, `${name}.png`));
  }
  const tiles = [];
  for (const [index, [name, background]] of [['icon', '#eeefe9'], ['logo-light', '#fafafa'], ['logo-dark', '#171717'], ['monochrome', '#7a8871']].entries()) {
    let graphic = await sharp(path.join(output, `${name}.png`)).resize(280, 280).toBuffer();
    if (index === 0) graphic = await sharp(graphic).composite([{ input: Buffer.from('<svg width="280" height="280"><rect width="280" height="280" rx="60" fill="white"/></svg>'), blend: 'dest-in' }]).png().toBuffer();
    const title = index === 0 ? 'My Notes' : ['','Light','Dark','Themed icon'][index];
    const label = await sharp({ text: { text: `<span foreground="${index < 2 ? graphite : ivory}">${title}</span>`, font: 'Urbanist SemiBold 22', fontfile: path.resolve(__dirname, '../assets/fonts/Urbanist-SemiBold.ttf'), rgba: true } }).png().toBuffer();
    const labelSize = await sharp(label).metadata();
    const tile = await sharp({ create: { width: 360, height: 370, channels: 4, background } }).composite([{ input: graphic, left: 40, top: 15 }, { input: label, left: Math.round((360 - labelSize.width) / 2), top: 320 }]).png().toBuffer();
    tiles.push({ input: tile, left: (index % 2) * 360, top: Math.floor(index / 2) * 370 });
  }
  await sharp({ create: { width: 720, height: 740, channels: 4, background: ivory } }).composite(tiles).png().toFile(path.join(output, 'brand-preview.png'));
  console.log(`My Notes branding exported to ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
