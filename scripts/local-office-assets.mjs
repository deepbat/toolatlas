// Optional asset preparation. A changed upstream latest binary MUST fail its pinned hash.
// No document ever goes to these URLs. Only program/font files are fetched at build time.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../public/office-engine/',import.meta.url));
export const ENGINE={
 wasm:{url:'https://cdn.zetaoffice.net/zetaoffice_latest/soffice.wasm',sha256:'9ebd9a487e849a24b9c69f843ebdb451709c27b7722c010e36846433474a5bd4'},
 data:{url:'https://cdn.zetaoffice.net/zetaoffice_latest/soffice.data',sha256:'3dab0a5448e599dccc1b1e69f4f86ea9eb30777c3f1ed7b9c386a5f4163e361c'},
 loader:{url:'https://cdn.zetaoffice.net/zetaoffice_latest/soffice.js',sha256:'5143e5354f470b87f86ba272bcfef857bd13e6f07b59666e48a7ccb89643cd77'},
 metadata:{url:'https://cdn.zetaoffice.net/zetaoffice_latest/soffice.data.js.metadata',sha256:'5d9d909d0b9b38443c0f19704032d0fc12d654f6c9c24c2c3b237739c4848ae3'},
};
export const FONTS={
 hindi:{url:'https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf',sha256:'385e78e6359a9d88a0f243d53b1209d7548361ba2194e2b9ec779bcaa7e8949d'},
 punjabi:{url:'https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansGurmukhi/NotoSansGurmukhi-Regular.ttf',sha256:'bbde4d85fdfb998eff6921cb2c7a9a7924a1c95560a6aa9a06172530e4f596da'},
};
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function checked(bytes,sha){if(digest(bytes)!==sha)throw Error('Office asset SHA-256 mismatch');return bytes;}
export function split(bytes,name,size=20*1024*1024){const parts=[];for(let i=0;i<bytes.length;i+=size){const b=bytes.subarray(i,i+size);parts.push({url:`runtime/${name}-${parts.length}.bin`,sha256:digest(b),bytes:b});}return parts;}
async function get(spec){const r=await fetch(spec.url);if(!r.ok)throw Error('Office asset download failed: '+r.status);return checked(Buffer.from(await r.arrayBuffer()),spec.sha256);}
export async function prepare(){
 await mkdir(root+'runtime',{recursive:true});const manifest={sourceCommit:'efaf0670b4d055f838a2849becb10f08aa06a257'};
 for(const name of ['wasm','data']){const b=await get(ENGINE[name]),parts=split(b,name);for(const p of parts)await writeFile(root+p.url,p.bytes);manifest[name]={bytes:b.length,sha256:digest(b),parts:parts.map(({url,sha256})=>({url,sha256}))};}
 await writeFile(root+'runtime/soffice.js',await get(ENGINE.loader));
 await writeFile(root+'runtime/soffice.data.js.metadata',await get(ENGINE.metadata));
 await mkdir(root+'fonts',{recursive:true});manifest.fonts={};
 for(const name of ['hindi','punjabi']){await writeFile(root+'fonts/'+name+'.ttf',await get(FONTS[name]));manifest.fonts[name]=FONTS[name].sha256;}
 // Complete binary-specific license/source correspondence is still a release gate.
 await writeFile(root+'runtime/manifest.json',JSON.stringify(manifest));
}

if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv.includes('--prepare'))await prepare();
