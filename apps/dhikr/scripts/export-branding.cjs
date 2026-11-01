// Editable SVG artwork with repeatable launcher, themed-icon and splash exports.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const output = path.resolve(__dirname, '../assets/branding');
const emerald = '#1b6a50', mint = '#bfe6d1', gold = '#e4c477', pearl = '#f7faf5';
const beads = Array.from({ length: 11 }, (_, i) => {
  const angle = (135 + i * 27) * Math.PI / 180;
  return { x: (512 + 190 * Math.cos(angle)).toFixed(2), y: (448 + 190 * Math.sin(angle)).toFixed(2), active: i === 8 };
});
function mark(monochrome) {
  const color = value => monochrome || value;
  return `<path d="M377.65 582.35A190 190 0 1 1 646.35 582.35L512 662Z" fill="none" stroke="${color(mint)}" stroke-width="10" stroke-linejoin="round"/>
    ${beads.map(bead => `<circle cx="${bead.x}" cy="${bead.y}" r="29" fill="${color(bead.active ? gold : pearl)}"/>`).join('')}
    <rect x="491" y="636" width="42" height="61" rx="21" fill="${color(gold)}"/>
    <g fill="none" stroke="${color(pearl)}" stroke-width="15" stroke-linecap="round">
      <path d="M512 710C512 742 478 751 480 784M512 710V792M512 710C512 742 546 751 544 784"/>
    </g><rect x="481" y="696" width="62" height="18" rx="9" fill="${color(mint)}"/>`;
}
function svg(art, background, tight = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${tight ? '192 192 640 640' : '0 0 1024 1024'}">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}${art}</svg>`;
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const [name, art, background, size, tight] of [
    ['icon', mark(), emerald, 1024], ['store-icon', mark(), emerald, 512],
    ['adaptive-foreground', mark(), null, 1024], ['monochrome', mark('#ffffff'), null, 1024],
    ['splash-light', mark(emerald), null, 512, true], ['splash-dark', mark('#81dab8'), null, 512, true],
  ]) {
    const source = svg(art, background, tight);
    await fs.writeFile(path.join(output, name + '.svg'), source);
    await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(output, name + '.png'));
  }
  const tiles = [];
  for (const [index, [name, background, label]] of [
    ['icon', '#f5f9f7', 'Dhikr'], ['adaptive-foreground', emerald, 'Adaptive icon'],
    ['monochrome', '#526d60', 'Themed icon'], ['splash-dark', '#101916', 'Dark splash'],
  ].entries()) {
    let graphic = await sharp(path.join(output, name + '.png')).resize(240, 240).toBuffer();
    if (index < 2) graphic = await sharp(graphic).composite([{ input: Buffer.from(`<svg width="240" height="240"><rect width="240" height="240" rx="${index === 0 ? 54 : 120}" fill="white"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    const caption = await sharp({ text: { text: `<span foreground="${index === 0 ? emerald : '#ffffff'}">${label}</span>`, font: 'Urbanist SemiBold 20', fontfile: path.resolve(__dirname, '../assets/fonts/Urbanist-SemiBold.ttf'), rgba: true } }).png().toBuffer();
    const meta = await sharp(caption).metadata();
    const tile = await sharp({ create: { width: 320, height: 330, channels: 4, background } }).composite([{ input: graphic, left: 40, top: 15 }, { input: caption, left: Math.round((320 - meta.width) / 2), top: 285 }]).png().toBuffer();
    tiles.push({ input: tile, left: (index % 2) * 320, top: Math.floor(index / 2) * 330 });
  }
  await sharp({ create: { width: 640, height: 660, channels: 4, background: '#ffffff' } }).composite(tiles).png().toFile(path.join(output, 'brand-preview.png'));
  console.log('Dhikr branding exported to ' + output);
})().catch(error => { console.error(error); process.exitCode = 1; });
