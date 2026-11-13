// Minimal ZIP writer (store, no compression) and reader (store and deflate).
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export interface ZipFile {
  name: string;
  data: Uint8Array;
}
const enc = new TextEncoder();
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
export function makeZip(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  if (files.length > 65000) throw Error('Too many files for one ZIP.');
  const { time, date } = dosDateTime(new Date());
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const f of files) {
    let name = f.name.replace(/[\\:*?"<>|]+/g, '_');
    for (let i = 2; seen.has(name); i++) name = f.name.replace(/(\.[^.]*)?$/, `-${i}$1`);
    seen.add(name);
    const nameBytes = enc.encode(name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(new ArrayBuffer(all.reduce((s, c) => s + c.length, 0)));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
export const zipBlob = (files: ZipFile[]) => new Blob([makeZip(files)], { type: 'application/zip' });

async function inflateRaw(data: Uint8Array,maxBytes:number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw Error('This browser cannot unzip files. Update your browser.');
  const reader=new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw Error('The archive expands beyond its safe size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
  const out=new Uint8Array(length);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;
}
/** Reads standard, unencrypted ZIPs. Checks bounds, CRC and actual expanded sizes. */
export async function readZip(buf:ArrayBuffer|Uint8Array,maxTotal=200*1024*1024,maxEntries=10000):Promise<Map<string,Uint8Array>>{
 const bytes=buf instanceof Uint8Array?buf:new Uint8Array(buf),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const bounds=(at:number,length:number)=>{if(at<0||length<0||at+length>bytes.length)throw Error('The ZIP directory or file data is truncated.');};
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('This is not a valid ZIP or Excel file.');
 const count=dv.getUint16(eocd+10,true);if(count>maxEntries)throw Error('The archive contains too many files.');
 if(dv.getUint16(eocd+4,true)!==0||dv.getUint16(eocd+6,true)!==0||count===65535)throw Error('Split and ZIP64 archives are not supported.');
 let p=dv.getUint32(eocd+16,true),total=0;const out=new Map<string,Uint8Array>();
 for(let i=0;i<count;i++){
  bounds(p,46);if(dv.getUint32(p,true)!==0x02014b50)throw Error('The ZIP directory is damaged.');
  if(dv.getUint16(p+8,true)&1)throw Error('Password-protected ZIPs are not supported.');
  const method=dv.getUint16(p+10,true),crc=dv.getUint32(p+16,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true),nlen=dv.getUint16(p+28,true),elen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
  bounds(p+46,nlen+elen+clen);const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nlen));p+=46+nlen+elen+clen;
  if(usize>maxTotal-total)throw Error('The archive expands beyond its safe size limit.');
  bounds(lho,30);if(dv.getUint32(lho,true)!==0x04034b50)throw Error('The ZIP local header is damaged.');
  const start=lho+30+dv.getUint16(lho+26,true)+dv.getUint16(lho+28,true);bounds(start,csize);
  if(name.endsWith('/'))continue;
  const raw=bytes.subarray(start,start+csize);const data=method===0?raw:method===8?await inflateRaw(raw,Math.min(usize,maxTotal-total)):(()=>{throw Error('Unsupported ZIP compression.');})();
  if(data.length!==usize||crc32(data)!==crc)throw Error('The ZIP file size or checksum is invalid.');total+=data.length;
  if(out.has(name))throw Error('This ZIP contains duplicate paths. Unzip it on your device first.');out.set(name,data);
 }
 return out;
}
