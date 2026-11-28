// Bounded TrueType outline reader for fonts embedded by the local Office engine.
// No shaping is done here: the PDF already supplies shaped glyph codes/positions.
// Unsupported font tables, point-matched composites and invalid data are rejected.
type Point={x:number;y:number;on:boolean};
type Command={command:string;args:number[]};
export function officeTrueType(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const check=(p:number,n:number)=>{if(!Number.isInteger(p)||p<0||n<0||p+n>bytes.length)throw Error('Invalid Office font bounds.');};
 const u8=(p:number)=>{check(p,1);return view.getUint8(p);},i8=(p:number)=>{check(p,1);return view.getInt8(p);};
 const u16=(p:number)=>{check(p,2);return view.getUint16(p);},i16=(p:number)=>{check(p,2);return view.getInt16(p);};
 const u32=(p:number)=>{check(p,4);return view.getUint32(p);};
 function reject():never{throw Error('Unsupported Office font outline.');}
 if(u32(0)!==0x10000&&u32(0)!==0x74727565)reject();const count=u16(4);if(count>128)reject();
 const tables=new Map<string,{offset:number;length:number}>();for(let i=0;i<count;i++){const p=12+i*16;check(p,16);const tag=String.fromCharCode(...bytes.slice(p,p+4)),offset=u32(p+8),length=u32(p+12);check(offset,length);tables.set(tag,{offset,length});}
 const table=(tag:string)=>tables.get(tag)??reject();if(tables.has('gvar')||tables.has('CFF ')||tables.has('CFF2'))reject();const head=table('head'),maxp=table('maxp'),loca=table('loca'),glyf=table('glyf'),cmap=table('cmap');
 if(head.length<54||maxp.length<6||cmap.length<4)reject();const unitsPerEm=u16(head.offset+18),long=u16(head.offset+50),glyphs=u16(maxp.offset+4);if(unitsPerEm<16||unitsPerEm>16384||long>1||glyphs===0)reject();
 if(loca.length<(glyphs+1)*(long?4:2))reject();
 // LibreOffice's embedded simple TrueType subsets use a format0 Macintosh cmap.
 // Accept only a single unambiguous format0 mapping, never guess from Unicode.
 const cmapCount=u16(cmap.offset+2);if(cmapCount>128||4+cmapCount*8>cmap.length)reject();let codes:number[]|undefined;for(let i=0;i<cmapCount;i++){const p=cmap.offset+4+i*8;check(p,8);const at=cmap.offset+u32(p+4);if(at<cmap.offset||at+262>cmap.offset+cmap.length)continue;if(u16(at)===0){if(u16(at+2)!==262)reject();const next=Array.from(bytes.slice(at+6,at+262));if(codes&&codes.some((v,k)=>v!==next[k]))reject();codes=next;}}
 if(!codes)reject();const map=codes;
 const location=(id:number)=>{if(id<0||id>glyphs)reject();const at=loca.offset+id*(long?4:2);return long?u32(at):u16(at)*2;};
 const cache=new Map<number,Point[][]>();let totalPoints=0;
 function contours(id:number,active=new Set<number>()):Point[][]{
  const prior=cache.get(id);if(prior)return prior;if(id>=glyphs||active.has(id)||active.size>24)reject();active.add(id);
  const begin=location(id),end=location(id+1);if(end<begin||end>glyf.length)reject();if(begin===end){active.delete(id);cache.set(id,[]);return[];}const base=glyf.offset+begin,limit=glyf.offset+end;let p=base;const need=(n:number)=>{if(p+n>limit)reject();};need(10);const n=i16(p);p+=10;let result:Point[][]=[];
  if(n===0){result=[];}else if(n>0){if(n>4096)reject();need(n*2+2);const ends:number[]=[];for(let c=0;c<n;c++){const e=u16(p);p+=2;if(c&&e<=ends[c-1])reject();ends.push(e);}const points=n?ends[n-1]+1:0;if(points>65536)reject();const instructionLength=u16(p);p+=2;need(instructionLength);p+=instructionLength;
   const flags:number[]=[];while(flags.length<points){need(1);const f=u8(p++);flags.push(f);if(f&8){need(1);const repeats=u8(p++);if(flags.length+repeats>points)reject();for(let k=0;k<repeats;k++)flags.push(f);}}
   const xs:number[]=[],ys:number[]=[];let x=0,y=0;for(const f of flags){let d=0;if(f&2){need(1);d=u8(p++);if(!(f&16))d=-d;}else if(!(f&16)){need(2);d=i16(p);p+=2;}x+=d;xs.push(x);}for(const f of flags){let d=0;if(f&4){need(1);d=u8(p++);if(!(f&32))d=-d;}else if(!(f&32)){need(2);d=i16(p);p+=2;}y+=d;ys.push(y);}
   let start=0;for(const e of ends){result.push(Array.from({length:e-start+1},(_,k)=>({x:xs[start+k],y:ys[start+k],on:!!(flags[start+k]&1)})));start=e+1;}
  }else if(n===-1){let flags=0,components=0;do{if(++components>256)reject();need(4);flags=u16(p);if([8,64,128].filter(b=>flags&b).length>1)reject();const child=u16(p+2);p+=4;if(!(flags&2)||flags&0x1800)reject();let dx:number,dy:number;if(flags&1){need(4);dx=i16(p);dy=i16(p+2);p+=4;}else{need(2);dx=i8(p);dy=i8(p+1);p+=2;}let a=1,b=0,c=0,d=1;if(flags&8){need(2);a=d=i16(p)/16384;p+=2;}else if(flags&64){need(4);a=i16(p)/16384;d=i16(p+2)/16384;p+=4;}else if(flags&128){need(8);a=i16(p)/16384;b=i16(p+2)/16384;c=i16(p+4)/16384;d=i16(p+6)/16384;p+=8;}
   for(const contour of contours(child,active))result.push(contour.map(q=>({x:a*q.x+c*q.y+dx,y:b*q.x+d*q.y+dy,on:q.on})));if(result.length>8192)reject();
   }while(flags&32);if(flags&256){need(2);const ins=u16(p);p+=2;need(ins);p+=ins;}
  }else reject();
  active.delete(id);totalPoints+=result.reduce((n,c)=>n+c.length,0);if(totalPoints>2000000)reject();cache.set(id,result);return result;
 }
 function commands(id:number):Command[]{const out:Command[]=[];for(const contour of contours(id)){if(!contour.length)continue;const first=contour[0],last=contour[contour.length-1];const start=first.on?first:last.on?last:{x:(first.x+last.x)/2,y:(first.y+last.y)/2,on:true};out.push({command:'moveTo',args:[start.x,start.y]});const pts=first.on?contour.slice(1):last.on?contour.slice(0,-1):contour.slice();let pending:Point|undefined;
   for(const q of pts){if(q.on){if(pending){out.push({command:'quadraticCurveTo',args:[pending.x,pending.y,q.x,q.y]});pending=undefined;}else out.push({command:'lineTo',args:[q.x,q.y]});}else{if(pending)out.push({command:'quadraticCurveTo',args:[pending.x,pending.y,(pending.x+q.x)/2,(pending.y+q.y)/2]});pending=q;}}
   if(pending)out.push({command:'quadraticCurveTo',args:[pending.x,pending.y,start.x,start.y]});out.push({command:'closePath',args:[]});}
  return out;
 }
 return{unitsPerEm,glyphForCodePoint(code:number){if(!Number.isInteger(code)||code<0||code>255)reject();const id=map[code];if(id>=glyphs)reject();return{id,path:{commands:commands(id)}};}};
}
