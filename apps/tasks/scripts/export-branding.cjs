// Editable vector artwork and deterministic PNG exports for Tasks.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const output = path.resolve(__dirname, '../assets/branding');
const purple = '#5e37b9', lavender = '#ddd2f8', paper = '#ffffff';
const board = '<rect x="310" y="286" width="404" height="476" rx="58"/>';
const clip = '<rect x="426" y="248" width="172" height="84" rx="30"/>';
const checks = '<path d="m374 448 27 28 48-55m-75 157 27 28 48-55"/>';
const lines = '<path d="M500 449h133m-133 130h106"/>';
const strokes = `fill="none" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"`;
function coloredMark() {
  return `<g fill="${paper}">${board}</g><g fill="${lavender}">${clip}</g><g stroke="${purple}" ${strokes}>${checks}${lines}</g>`;
}
function monoMark(color) {
  return `<defs><mask id="checklist"><rect width="1024" height="1024" fill="black"/><g fill="white">${board}${clip}</g><g stroke="black" ${strokes}>${checks}${lines}</g></mask></defs><rect width="1024" height="1024" fill="${color}" mask="url(#checklist)"/>`;
}
function svg(mark, background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}${mark}</svg>`;
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const [name, mark, background, size] of [
    ['icon', coloredMark(), purple, 1024],
    ['store-icon', coloredMark(), purple, 512],
    ['adaptive-foreground', coloredMark(), null, 1024],
    ['monochrome', monoMark(paper), null, 1024],
    ['notification', monoMark(paper), null, 96],
    ['splash-light', monoMark(purple), null, 512],
    ['splash-dark', monoMark(lavender), null, 512],
  ]) {
    // Small notification icons need a tighter crop than adaptive launchers.
    const source = name === 'notification'
      ? svg(mark, background).replace('viewBox="0 0 1024 1024"', 'viewBox="192 192 640 640"')
      : svg(mark, background);
    await fs.writeFile(path.join(output, `${name}.svg`), source);
    await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(output, `${name}.png`));
  }
  const tiles = [];
  for (const [index, [name, background]] of [
    ['icon', '#f9f8fc'], ['adaptive-foreground', purple],
    ['monochrome', '#6e6092'], ['splash-dark', '#191925'],
  ].entries()) {
    let graphic = await sharp(path.join(output, `${name}.png`)).resize(240, 240).toBuffer();
    if (index < 2) {
      const mask = `<svg width="240" height="240"><rect width="240" height="240" rx="${index === 0 ? 54 : 120}" fill="white"/></svg>`;
      graphic = await sharp(graphic).composite([{ input: Buffer.from(mask), blend: 'dest-in' }]).png().toBuffer();
    }
    const label = await sharp({ text: {
      text: `<span foreground="${index === 0 ? '#23212d' : '#ffffff'}">${['Tasks', 'Adaptive icon', 'Themed icon', 'Dark splash'][index]}</span>`,
      font: 'Urbanist SemiBold 20', fontfile: path.resolve(__dirname, '../assets/fonts/Urbanist-SemiBold.ttf'), rgba: true,
    } }).png().toBuffer();
    const size = await sharp(label).metadata();
    const tile = await sharp({ create: { width: 320, height: 330, channels: 4, background } }).composite([
      { input: graphic, left: 40, top: 15 }, { input: label, left: Math.round((320 - size.width) / 2), top: 285 },
    ]).png().toBuffer();
    tiles.push({ input: tile, left: (index % 2) * 320, top: Math.floor(index / 2) * 330 });
  }
  await sharp({ create: { width: 640, height: 660, channels: 4, background: paper } }).composite(tiles).png().toFile(path.join(output, 'brand-preview.png'));
  console.log(`Tasks branding exported to ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
