import assert from 'node:assert/strict';
import { findCardBoxes, sheetCells, CARD_PX } from '../src/tools/new/pvc';
const W=800,H=1100,d=new Uint8ClampedArray(W*H*4).fill(255);
const fill=(x0:number,y0:number,w:number,h:number)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=(y*W+x)*4;d[i]=40;d[i+1]=90;d[i+2]=160;}};
fill(60,80,320,200);fill(420,80,320,200);fill(100,500,300,190);
const b=findCardBoxes(d,W,H);
assert.equal(b.length,3,'three cards found');
assert.ok(Math.abs(b[0].x-60)<8&&Math.abs(b[0].w-320)<12,'first box tight');
assert.ok(b[1].x>b[0].x&&b[2].y>b[1].y,'reading order');
assert.deepEqual(findCardBoxes(new Uint8ClampedArray(W*H*4).fill(255),W,H),[]);
assert.equal(CARD_PX.w,1011);assert.equal(CARD_PX.h,638);
for(const r of [1,2,5]){const c=sheetCells(r);assert.equal(c.length,r*2);assert.ok(c.every(x=>x.x>=0&&x.y>=0&&x.x+85.6<=210&&x.y+54<=297));}
console.log('PASS pvc unit');
