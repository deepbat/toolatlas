// Repair the logical text of locally generated LibreOffice PDFs without rasterizing
// visible glyphs. Only known, checked text streams are accepted. Other PDF inputs
// must never be passed to this converter-specific repair.
import {PDFArray,PDFDict,PDFDocument,PDFName,PDFNumber,PDFRawStream,PDFRef,decodePDFRawStream} from 'pdf-lib';
import {officeTrueType} from './officeTrueType';
import {InvisibleUnicodeFont,drawInvisibleWords,type PlacedWord} from './unicodeLayer';

type Token={raw:string;start:number;end:number;bytes?:number[]};
type Font={face:any;map:Map<number,string>;width:(c:number)=>number;indic:boolean};
const name=(s:string)=>PDFName.of(s);
const text=(s:PDFRawStream)=>Array.from(decodePDFRawStream(s).decode(),c=>String.fromCharCode(c)).join('');
function fail():never{throw Error('The Office PDF contains a text layout that cannot yet be repaired safely.');}
const num=(t:Token|undefined)=>{const n=Number(t?.raw);return Number.isFinite(n)?n:fail();};
const indic=(s:string)=>/[\u0900-\u0dff]/u.test(s);

function tokenize(s:string):Token[]{
 const out:Token[]=[];let i=0;
 while(i<s.length){if(/[\s\0]/.test(s[i])){i++;continue;}if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;continue;}
 const start=i;let bytes:number[]|undefined;
 if(s[i]==='('){bytes=[];i++;let depth=1;while(i<s.length&&depth){let c=s.charCodeAt(i++);if(c===92){const e=s[i++];if(e==='\r'||e==='\n'){if(e==='\r'&&s[i]==='\n')i++;continue;}if(/[0-7]/.test(e||'x')){let o=e;for(let n=0;n<2&&/[0-7]/.test(s[i]||'x');n++)o+=s[i++];c=parseInt(o,8)&255;}else c=({n:10,r:13,t:9,b:8,f:12}as Record<string,number>)[e]??e?.charCodeAt(0);}else if(c===40)depth++;else if(c===41&&--depth===0)break;if(Number.isFinite(c))bytes.push(c);else fail();}if(depth)fail();
 }else if(s[i]==='<'&&s[i+1]!=='<'){i++;const hs=i;while(i<s.length&&s[i]!=='>')i++;if(i===s.length)fail();let h=s.slice(hs,i++).replace(/\s/g,'');if(!/^[\da-f]*$/i.test(h))fail();if(h.length%2)h+='0';bytes=h.match(/../g)?.map(x=>parseInt(x,16))??[];
 }else if('[]<>'.includes(s[i])){i++;if((s[start]==='<'||s[start]==='>')&&s[i]===s[start])i++;
 }else if(s[i]==='/'){i++;while(i<s.length&&!/[\s\[\]()<>/%]/.test(s[i]))i++;
 }else{while(i<s.length&&!/[\s\[\]()<>/%]/.test(s[i]))i++;if(i===start)fail();}
 out.push({raw:s.slice(start,i),start,end:i,bytes});if(out.length>2000000)fail();
 }return out;
}
function unmark(s:string){const ts=tokenize(s);let operands:Token[]=[],depth=0,arr=0,last=0,out='';for(const t of ts){if(t.raw==='[')arr++;if(t.raw==='<<')depth++;const op=!arr&&!depth&&!t.bytes&&/^[A-Za-z*'"]+$/.test(t.raw);if(!op){operands.push(t);if(t.raw===']')arr--;if(t.raw==='>>')depth--;continue;}if(['BMC','BDC','EMC'].includes(t.raw)){if(operands.some(z=>z.raw==='/ActualText'))fail();const start=operands[0]?.start??t.start;out+=s.slice(last,start);last=t.end;}operands=[];}return out+s.slice(last);}
function utf16(bytes:number[],bom=false){if(bom){if(bytes[0]!==254||bytes[1]!==255)fail();bytes=bytes.slice(2);}if(bytes.length%2)fail();let s='';for(let i=0;i<bytes.length;i+=2)s+=String.fromCharCode(bytes[i]*256+bytes[i+1]);return s;}
function readFont(dict:PDFDict):Font|undefined{
 const unicode=dict.lookup(name('ToUnicode'));if(!(unicode instanceof PDFRawStream))return;
 const m=text(unicode),map=new Map<number,string>();
 if(/beginbfrange/.test(m))fail();
 for(const block of m.matchAll(/(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g)){let count=0;for(const p of block[2].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)){if(p[1].length!==2)fail();const bytes=p[2].match(/../g)?.map(h=>parseInt(h,16))??[];map.set(parseInt(p[1],16),utf16(bytes));count++;}if(count!==+block[1])fail();}
 if(![...map.values()].some(indic))return;
 if(dict.lookup(name('Subtype'))!==name('TrueType'))fail();
 const fd=dict.lookup(name('FontDescriptor'));if(!(fd instanceof PDFDict))fail();const ff=fd.lookup(name('FontFile2'));if(!(ff instanceof PDFRawStream))fail();
 const face=officeTrueType(decodePDFRawStream(ff).decode());if(!(face.unitsPerEm>0))fail();
 const w=dict.lookup(name('Widths'));if(!(w instanceof PDFArray))fail();const widths=w.asArray().map(x=>{if(!(x instanceof PDFNumber))fail();return x.asNumber();});const f=dict.lookup(name('FirstChar'));if(!(f instanceof PDFNumber))fail();const first=f.asNumber();
 return{face,map,width:c=>widths[c-first]??fail(),indic:true};
}
function readSupportingFont(dict:PDFDict):Font{
 const u=dict.lookup(name('ToUnicode'));if(!(u instanceof PDFRawStream))fail();const m=text(u),map=new Map<number,string>();if(/beginbfrange/.test(m))fail();for(const b of m.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const p of b[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)){if(p[1].length!==2)fail();map.set(parseInt(p[1],16),utf16(p[2].match(/../g)!.map(h=>parseInt(h,16))));}
 if(dict.lookup(name('Subtype'))!==name('TrueType'))fail();const fd=dict.lookup(name('FontDescriptor'));if(!(fd instanceof PDFDict))fail();const ff=fd.lookup(name('FontFile2'));if(!(ff instanceof PDFRawStream))fail();const face=officeTrueType(decodePDFRawStream(ff).decode());const wa=dict.lookup(name('Widths'));if(!(wa instanceof PDFArray))fail();const widths=wa.asArray().map(x=>(x as PDFNumber).asNumber());const first=(dict.lookup(name('FirstChar'))as PDFNumber).asNumber();return{face,map,width:c=>widths[c-first]??fail(),indic:false};
}
function outline(font:Font,code:number,size:number,x:number,y:number){
 const glyph=font.face.glyphForCodePoint(code);if(!glyph||glyph.id===0&&code!==0)fail();let px=0,py=0,path='';
 for(const c of glyph.path.commands){const a=c.args;if(a.some((v:number)=>!Number.isFinite(v)))fail();switch(c.command){case'moveTo':path+=`${a[0]} ${a[1]} m `;[px,py]=a;break;case'lineTo':path+=`${a[0]} ${a[1]} l `;[px,py]=a;break;case'quadraticCurveTo':{const[cx,cy,ex,ey]=a;path+=`${px+2/3*(cx-px)} ${py+2/3*(cy-py)} ${ex+2/3*(cx-ex)} ${ey+2/3*(cy-ey)} ${ex} ${ey} c `;px=ex;py=ey;break;}case'bezierCurveTo':path+=a.join(' ')+' c ';px=a[4];py=a[5];break;case'closePath':path+='h ';break;default:fail();}}
 return path?`q ${size/font.face.unitsPerEm} 0 0 ${size/font.face.unitsPerEm} ${x} ${y} cm ${path}f Q\n`:'';
}
function repairObject(tokens:Token[],fonts:Map<string,Font>,dicts:PDFDict){
 let x=0,y=0,lx=0,ly=0,sx=1,sy=1,size=0,font:Font|undefined,paths='',operands:Token[]=[],depth=0,arr=0;
 const chunks:PlacedWord[]=[],marks:({word:PlacedWord}|null)[]=[];
 for(const t of tokens){if(t.raw==='[')arr++;if(t.raw==='<<')depth++;const op=!arr&&!depth&&!t.bytes&&/^[A-Za-z*'"]+$/.test(t.raw);if(!op){operands.push(t);if(t.raw===']')arr--;if(t.raw==='>>')depth--;continue;}
 switch(t.raw){case'Tf':{if(operands.length!==2)fail();const n=operands[0].raw.slice(1);size=num(operands[1]);if(size<=0||size>10000)fail();font=fonts.get(n);if(!font){const d=dicts.lookup(name(n));if(!(d instanceof PDFDict))fail();font=readSupportingFont(d);fonts.set(n,font);}break;}
 case'Tm':if(operands.length!==6||num(operands[1])!==0||num(operands[2])!==0||num(operands[0])<=0||num(operands[3])<=0)fail();sx=num(operands[0]);sy=num(operands[3]);x=lx=num(operands[4]);y=ly=num(operands[5]);break;
 case'Td':lx+=num(operands[0])*sx;ly+=num(operands[1])*sy;x=lx;y=ly;break;
 case'Tj':case'TJ':{if(!font||!size)fail();const start=x;let logical='';for(const p of operands){if(p.bytes){for(const c of p.bytes){const u=font.map.get(c);if(u===undefined&&!marks.some(Boolean))fail();logical+=u??'';paths+=`q ${sx} 0 0 ${sy} ${x} ${y} cm `+outline(font,c,size,0,0)+'Q\n';x+=font.width(c)*size*sx/1000;}}else if(/^[-+]?\d*\.?\d+$/.test(p.raw)){if(t.raw!=='TJ')fail();x-=num(p)*size*sx/1000;}else if(p.raw!=='['&&p.raw!==']')fail();}
 const mark=[...marks].reverse().find(m=>m!==null);if(mark){if(!Number.isFinite(mark.word.x)){mark.word.x=start;mark.word.y=y;mark.word.h=size*sy;}if(Math.abs(mark.word.y-y)>.01)fail();mark.word.w=x-mark.word.x;}else if(logical.trim())chunks.push({text:logical,x:start,y,w:x-start,h:size*sy});break;}
 case'BDC':{const k=operands.findIndex(p=>p.raw==='/ActualText');if(k>=0){if(marks.some(Boolean)||!operands[k+1]?.bytes)fail();marks.push({word:{text:utf16(operands[k+1].bytes!,true),x:NaN,y:0,w:0,h:size}});}else marks.push(null);break;}
 case'BMC':marks.push(null);break;
 case'EMC':{if(!marks.length)fail();const m=marks.pop();if(m){if(!Number.isFinite(m.word.x)||!(m.word.w>0))fail();chunks.push(m.word);}break;}
 case'Tc':case'Tw':case'Ts':case'Tr':if(operands.length!==1||num(operands[0])!==0)fail();break;
 case'Tz':if(num(operands[0])!==100)fail();break;
 default:fail();
 }operands=[];
 }
 if(marks.length||operands.length||!chunks.length)fail();
 const sorted=chunks.sort((a,b)=>Math.abs(a.y-b.y)<.5?a.x-b.x:b.y-a.y),words:PlacedWord[]=[];
 for(const c of sorted){const p=words[words.length-1];if(p&&Math.abs(p.y-c.y)<.5&&c.x-p.x-p.w<c.h*.18&&!p.text.endsWith(' ')&&!c.text.startsWith(' ')){if(c.x<p.x-.01)fail();p.text+=c.text;p.w=c.x+c.w-p.x;}else words.push({...c});}
 return{paths,words};
}

export async function repairLocalOfficePdf(bytes:Uint8Array):Promise<Uint8Array>{
 const doc=await PDFDocument.load(bytes);const inv=new InvisibleUnicodeFont(doc);let changed=false;
 for(const page of doc.getPages()){
 const resources=page.node.Resources();if(!(resources instanceof PDFDict))fail();const dicts=resources.lookup(name('Font'));if(!(dicts instanceof PDFDict))continue;
 const fonts=new Map<string,Font>();for(const[n,r]of dicts.entries()){if(r===inv.ref)continue;const d=dicts.lookup(n);if(!(d instanceof PDFDict))fail();const f=readFont(d);if(f)fonts.set(n.decodeText(),f);}if(!fonts.size)continue;
 const xo=resources.lookup(name('XObject'));if(xo instanceof PDFDict)for(const[,r]of xo.entries()){const o=doc.context.lookup(r);if(o instanceof PDFRawStream&&o.dict.lookup(name('Subtype'))===name('Form'))fail();}
 const raw=page.node.Contents();const list=raw instanceof PDFArray?raw.asArray().map(r=>doc.context.lookup(r)):raw instanceof PDFRef?[doc.context.lookup(raw)]:[raw];if(list.some(s=>!(s instanceof PDFRawStream)))fail();const source=list.map(s=>text(s as PDFRawStream)).join('\n');const tokens=tokenize(source);let start=-1,last=0,result='',ctmIdentity=true;const stack:boolean[]=[],words:PlacedWord[]=[];
 for(let i=0;i<tokens.length;i++){const t=tokens[i];if(t.raw==='BI')fail();if(t.raw==='cm')ctmIdentity=false;if(t.raw==='q')stack.push(ctmIdentity);if(t.raw==='Q'){if(!stack.length)fail();ctmIdentity=stack.pop()!;}if(start<0&&['Tc','Tw','Tr','Ts','Tz','Tf','gs'].includes(t.raw))fail();if(t.raw==='BT'){if(start!==-1)fail();start=i;}if(t.raw==='ET'){if(start<0)fail();const inner=tokens.slice(start+1,i);const affected=inner.some(z=>z.raw==='Tf');if(affected){if(!ctmIdentity)fail();const repaired=repairObject(inner,fonts,dicts);result+=source.slice(last,tokens[start].start)+'\n'+repaired.paths+'\n';last=t.end;words.push(...repaired.words);changed=true;}start=-1;}}
 if(start!==-1||stack.length)fail();if(words.length){result+=source.slice(last);page.node.set(name('Contents'),doc.context.obj([doc.context.register(doc.context.flateStream(unmark(result)))]));words.sort((a,b)=>Math.abs(a.y-b.y)<.5?a.x-b.x:b.y-a.y);drawInvisibleWords(page,inv,words);}
 }
 if(!changed)return bytes;doc.catalog.delete(name('StructTreeRoot'));doc.catalog.delete(name('MarkInfo'));for(const page of doc.getPages())page.node.delete(name('StructParents'));inv.finish();return doc.save();
}
