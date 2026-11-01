// Reproducible vector and PNG exports. Sharp is a development-only dependency.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const out = path.resolve(__dirname, '../assets/branding');
const sage = '#3e5948', cream = '#f8f9f4', dark = '#111813';
const geometry = `<defs><mask id="mark"><rect width="1024" height="1024" fill="black"/>
<g fill="white"><path d="M394 280 483 218Q512 198 541 218L630 280Z"/>
<path d="m284 356-70 54 70 44Zm456 0 70 54-70 44Z"/>
<rect x="302" y="300" width="420" height="330" rx="38"/>
<path d="M194 454Q194 422 218 438L498 615Q512 628 526 615L806 438Q830 422 830 454V748Q830 790 788 790H236Q194 790 194 748Z"/></g>
<g fill="none" stroke="black" stroke-width="16" stroke-linejoin="round"><path d="M324 484V362Q350 362 350 330H674Q674 362 700 362V484"/>
<path d="M292 454 499 600Q512 613 525 600L732 454" stroke-width="18" stroke-linecap="round"/>
<path d="M366 426H404M620 426H658" stroke-linecap="round"/></g>
<ellipse cx="512" cy="426" rx="75" ry="82" fill="black"/>
<g fill="none" stroke="white" stroke-width="14" stroke-linecap="square"><path d="M538 388C490 358 464 458 514 465Q528 466 539 455"/><path d="M470 412H521M466 435H515"/></g>
</mask></defs>`;
function svg(color,background,wordmark=false,inset=false){return `<svg xmlns="http://www.w3.org/2000/svg" width="${wordmark?1800:1024}" height="1024" viewBox="0 0 ${wordmark?1800:1024} 1024">${geometry}${background?`<rect width="100%" height="100%" fill="${background}"/>`:''}<g transform="${inset ? "translate(112.64 112.64) scale(.78)" : ""}"><rect width="1024" height="1024" fill="${color}" mask="url(#mark)"/></g>${wordmark?`<text x="950" y="555" font-family="sans-serif" font-size="145" font-weight="600" letter-spacing="-5" fill="${color}">MoneyPlan</text>`:''}</svg>`;}
async function png(name,color,background,size=1024){const input=svg(color,background,false,["adaptive-foreground","monochrome"].includes(name));await fs.writeFile(path.join(out,name+'.svg'),input);await sharp(Buffer.from(input)).resize(size,size).png().toFile(path.join(out,name+'.png'));}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  await png('icon',cream,sage);
  await png('store-icon',cream,sage,512);
  await png('adaptive-foreground',cream,null);
  await png('monochrome','#ffffff',null);
  await png('logo-light',sage,null);
  await png('logo-dark',cream,null);
  await png('splash-light',sage,null,512);
  await png('splash-dark',cream,null,512);
  for(const [name,color] of [['wordmark-light',sage],['wordmark-dark',cream]]){
    const source=svg(color,null,true);await fs.writeFile(path.join(out,name+'.svg'),source);await sharp(Buffer.from(source)).png().toFile(path.join(out,name+'.png'));
  }
  const tiles=[];
  for(const [i,name] of ['icon','logo-light','logo-dark','monochrome'].entries()){
    const bg=i===1?'#f8f9f4':i===0?'#e6ebdf':'#111813';
    const tile=await sharp({create:{width:400,height:450,channels:4,background:bg}}).composite([
      {input:await sharp(path.join(out,name+'.png')).resize(300,300).toBuffer(),left:50,top:30},
      {input:Buffer.from(`<svg width="400" height="70"><text x="200" y="40" text-anchor="middle" font-family="sans-serif" font-size="19" fill="${i<2?sage:cream}">${['Launcher','Light surfaces','Dark surfaces','Android themed'][i]}</text></svg>`),left:0,top:350}
    ]).png().toBuffer();
    tiles.push({input:tile,left:(i%2)*400,top:Math.floor(i/2)*450});
  }
  await sharp({create:{width:800,height:900,channels:4,background:cream}}).composite(tiles).png().toFile(path.join(out,'brand-preview.png'));
  console.log('MoneyPlan branding exported to '+out);
})().catch(error=>{console.error(error);process.exitCode=1;});
