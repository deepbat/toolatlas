import {useEffect, useRef, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Button, Field, Grid, Input, Note, Panel, Select} from '../../components/ui';
import {decodeAudio, recordingMime, range, transformAudio, wav, VIDEO_MAX_BYTES} from '../../lib/av';

type Result = {url:string;name:string;size:number;type:string};
export default function AVApp() {
  const {toolId:id=''}=useParams();
  const videoMode=id.startsWith('video-') && id!=='video-audio';
  const recorderMode=id==='voice-recorder';
  const [files,setFiles]=useState<File[]>([]), [source,setSource]=useState(''), [duration,setDuration]=useState(0);
  const [start,setStart]=useState('0'),[end,setEnd]=useState('0'),[gain,setGain]=useState('100'),[normalize,setNormalize]=useState(false),[fade,setFade]=useState(true),[rate,setRate]=useState('22050'),[height,setHeight]=useState('480');
  const [busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null);
  const media=useRef<HTMLVideoElement>(null),stop=useRef<(()=>void)|null>(null),alive=useRef(true), urls=useRef<string[]>([]),generation=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;stop.current?.();urls.current.forEach(URL.revokeObjectURL);};},[]);
  const clearResult=()=>{setResult(null);setError('');setMessage('');};
  const finish=(blob:Blob,name:string)=>{if(!alive.current)return;if(!blob.size)throw new Error('No output was produced.'); const url=URL.createObjectURL(blob);urls.current.push(url);setResult({url,name,size:blob.size,type:blob.type});setMessage('Ready. Preview your result before downloading.');};
  async function choose(selected:File[]){
    const job=++generation.current;clearResult();setDuration(0);setFiles([]);setSource('');setStart('0');setEnd('0');
    if(!selected.length)return;
    const max=videoMode?VIDEO_MAX_BYTES:50*1024*1024;
    if(selected.length>8 || selected.some(f=>f.size>max) || selected.reduce((n,f)=>n+f.size,0)>max){setError(`Use up to ${id==='audio-merge'?8:1} files, ${videoMode?100:50} MB total maximum.`);return;}
    setBusy(true);
    try{
      if(videoMode){setFiles(selected);const u=URL.createObjectURL(selected[0]);urls.current.push(u);setSource(u);}
      else {const ctx=new AudioContext();try{const buffers=[];for(const f of selected)buffers.push(await decodeAudio(f,ctx));const total=buffers.reduce((n,b)=>n+b.duration,0);if(total>300)throw new Error('Combined audio must be 5 minutes or shorter.');if(job!==generation.current)return;setFiles(selected);setDuration(buffers[0].duration);setEnd(String(buffers[0].duration));const u=URL.createObjectURL(selected[0]);urls.current.push(u);setSource(u);}finally{await ctx.close();}}
    }catch(e){if(job===generation.current)setError((e as Error).message);}finally{if(alive.current && job===generation.current)setBusy(false);}
  }
  async function audioExport(){
    const ctx=new AudioContext({sampleRate:id==='audio-size'?Number(rate):44100});
    try{
      const buffers=[];for(const f of files)buffers.push(await decodeAudio(f,ctx));
      const channels=Math.min(2,Math.max(...buffers.map(b=>b.numberOfChannels)));
      let out:Float32Array[];
      if(id==='audio-merge'){
        const length=buffers.reduce((n,b)=>n+b.length,0);out=Array.from({length:channels},()=>new Float32Array(length));let offset=0;
        for(const b of buffers){for(let c=0;c<channels;c++)out[c].set(b.getChannelData(Math.min(c,b.numberOfChannels-1)),offset);offset+=b.length;}
      }else{
        const b=buffers[0];const full=Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c));
        const s=id==='audio-trim'?Number(start):0,e=id==='audio-trim'?Number(end):b.duration;
        out=transformAudio(full,s,e,b.sampleRate,id==='audio-volume'?Number(gain)/100:1,id==='audio-volume'&&normalize,id==='audio-reverse',id==='audio-trim'&&fade);
        if(id==='audio-size'){const mono=new Float32Array(out[0].length);for(let i=0;i<mono.length;i++)mono[i]=out.reduce((n,c)=>n+c[i],0)/out.length;out=[mono];}
      }
      finish(wav(out,ctx.sampleRate),id+'.wav');
    }finally{await ctx.close();}
  }
  async function videoExport(){
    const v=media.current!; const s=id==='video-trim'||id==='video-frame'?Number(start):0, e=id==='video-trim'?Number(end):duration;
    range(s,id==='video-frame'?Math.min(duration,s+.001):e,duration);
    if(s!==v.currentTime){await new Promise<void>((resolve,reject)=>{v.onseeked=()=>resolve();v.onerror=()=>reject(new Error('Cannot seek in this video.'));v.currentTime=s;});}
    const canvas=document.createElement('canvas');const scale=id==='video-compress'?Math.min(1,Number(height)/v.videoHeight):1;
    canvas.width=Math.max(2,Math.round(v.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(v.videoHeight*scale/2)*2);const g=canvas.getContext('2d')!;g.drawImage(v,0,0,canvas.width,canvas.height);
    if(id==='video-frame'){const b=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));if(!b)throw new Error('Cannot capture this frame.');finish(b,'video-frame.png');return;}
    const mime=recordingMime(true);if(!mime || !canvas.captureStream)throw new Error('Video export is unavailable here. Try current Chrome or Edge.');
    const stream=canvas.captureStream(30),ctx=new AudioContext();let sourceNode:MediaElementAudioSourceNode|undefined;
    let raf=0,timer:ReturnType<typeof setInterval>|undefined;
    try{
      await ctx.resume();
      if(id!=='video-mute'){
        // A fresh media element allows repeat exports without reusing a connected element.
        v.muted=false;sourceNode=ctx.createMediaElementSource(v);const dest=ctx.createMediaStreamDestination();sourceNode.connect(dest);for(const t of dest.stream.getAudioTracks())stream.addTrack(t);
      }
      const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:id==='video-compress'?650000:2500000,audioBitsPerSecond:128000});const chunks:Blob[]=[];let cancelled=false;
      await new Promise<void>((resolve,reject)=>{
        const halt=()=>{if(rec.state!=='inactive')rec.stop();v.pause();};stop.current=()=>{cancelled=true;halt();};
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=()=>reject(new Error('Recording failed. Try a shorter clip.'));rec.onstop=()=>resolve();
        const draw=()=>{if(v.readyState>=2)g.drawImage(v,0,0,canvas.width,canvas.height);raf=requestAnimationFrame(draw);};draw();
        timer=setInterval(()=>{setMessage(`Exporting ${Math.min(100,Math.round((v.currentTime-s)/(e-s)*100))}% - keep this tab visible.`);if(v.currentTime>=e || v.ended)halt();},40);
        rec.start(250);v.play().catch(reject);
      });
      if(cancelled)throw new Error('Export cancelled.');
      finish(new Blob(chunks,{type:mime}),id+(mime.includes('mp4')?'.mp4':'.webm'));
    }finally{clearInterval(timer);cancelAnimationFrame(raf);stop.current=null;v.pause();sourceNode?.disconnect();stream.getTracks().forEach(t=>t.stop());await ctx.close();
      // Recreate the preview for the next export, releasing its Web Audio association.
      setSource(old=>{const u=URL.createObjectURL(files[0]);urls.current.push(u);return old===u?old:u;});
    }
  }
  async function run(){clearResult();setBusy(true);try{if(videoMode)await videoExport();else await audioExport();}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
  async function record(){
    clearResult();setBusy(true);let stream:MediaStream|undefined;let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const mime=recordingMime(false);if(!mime || !navigator.mediaDevices?.getUserMedia)throw new Error('Microphone recording is unavailable in this browser.');
      stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){stream.getTracks().forEach(t=>t.stop());return;}
      const rec=new MediaRecorder(stream,{mimeType:mime});const chunks:Blob[]=[];
      await new Promise<void>((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>resolve();rec.onerror=()=>reject(new Error('Recording failed.'));stop.current=()=>{if(rec.state!=='inactive')rec.stop();};rec.start(250);setRecording(true);setMessage('Recording locally. Stops automatically after 5 minutes.');timeout=setTimeout(()=>stop.current?.(),300000);});
      finish(new Blob(chunks,{type:mime}),'voice-recording.'+(mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm'));
    }catch(e){if(alive.current)setError((e as Error).name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser to record.':(e as Error).message);}finally{clearTimeout(timeout);stream?.getTracks().forEach(t=>t.stop());stop.current=null;if(alive.current){setRecording(false);setBusy(false);}}
  }
  return <div className="space-y-5">
    <Note>{videoMode?'Browser-playable inputs only (usually MP4 / WebM). Max 100 MB and 2 minutes, up to 1080p. Video export re-encodes in real time to WebM (MP4 only where supported), not lossless. Keep this tab visible. Cuts may vary by a few frames.':recorderMode?'Microphone access is requested only when you press Record. Up to 5 minutes. Output uses the format your browser supports (WebM, OGG or M4A), not MP3.':'Inputs: browser-decodable MP3, WAV, M4A, OGG and others. Up to 50 MB total, 5 minutes, mono/stereo. Output is 16-bit PCM WAV, not MP3, and can be larger than the original.'} No uploads or codec downloads.</Note>
    <Panel title={recorderMode?'Record your voice':'1 / Choose your file'}>
      {recorderMode?<div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={record}>Record microphone</Button><Button variant="secondary" disabled={!recording} onClick={()=>stop.current?.()}>Stop recording</Button></div>:<Field label={id==='audio-merge'?'Audio files (joined in the order below)':'Media file'}><Input type="file" accept={videoMode?'video/*':id==='video-audio'?'video/*':'audio/*'} multiple={id==='audio-merge'} disabled={busy} onChange={e=>choose(Array.from(e.target.files||[]))}/></Field>}
      {files.length>1&&<ol className="mt-4 space-y-2">{files.map((f,i)=><li key={i} className="flex min-w-0 items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-all">{i+1}. {f.name}</span><Button size="sm" variant="secondary" disabled={busy||i===0} onClick={()=>setFiles(fs=>{const next=[...fs];[next[i-1],next[i]]=[next[i],next[i-1]];clearResult();return next;})}>Up</Button></li>)}</ol>}
      {source&&(videoMode?<video key={source} ref={media} src={source} controls={!busy} playsInline muted className="mt-4 max-h-64 w-full bg-black" onError={()=>{setError('This browser cannot play this video. Try MP4 (H.264) or WebM.');setFiles([]);}} onLoadedMetadata={()=>{const v=media.current!;if(!Number.isFinite(v.duration)||v.duration>120||Math.max(v.videoWidth,v.videoHeight)>1920){setError('Use video up to 2 minutes and 1920 pixels on its longest side.');setFiles([]);return;}setDuration(v.duration);setEnd(prev=>Number(prev)>0?prev:String(v.duration));}}/>:<audio controls src={source} className="mt-4 w-full"/>)}
      {duration>0&&<p data-testid="av-duration" className="mt-3 text-sm text-muted">Duration: {duration.toFixed(2)} seconds</p>}
    </Panel>
    {!recorderMode&&files.length>0&&duration>0&&<Panel title="2 / Settings & export"><fieldset disabled={busy} className="space-y-4">
      {(id==='video-trim'||id==='video-frame'||id==='audio-trim')&&<Grid><Field label="Start (seconds)"><Input type="number" min="0" step="0.01" value={start} onChange={e=>{setStart(e.target.value);clearResult();}}/></Field>{id!=='video-frame'&&<Field label="End (seconds)"><Input type="number" step="0.01" value={end} onChange={e=>{setEnd(e.target.value);clearResult();}}/></Field>}</Grid>}
      {id==='audio-trim'&&<label className="block text-sm"><input type="checkbox" checked={fade} onChange={e=>{setFade(e.target.checked);clearResult();}}/> Fade edges (50 ms)</label>}
      {id==='audio-volume'&&<Grid><Field label="Volume (%)"><Input type="number" min="0" max="400" value={gain} onChange={e=>{setGain(e.target.value);clearResult();}}/></Field><label className="text-sm"><input type="checkbox" checked={normalize} onChange={e=>{setNormalize(e.target.checked);clearResult();}}/> Peak normalize to 98% (overrides volume, not broadcast loudness)</label></Grid>}
      {id==='audio-size'&&<Field label="Output sample rate (mono)"><Select value={rate} onChange={e=>{setRate(e.target.value);clearResult();}}><option value="22050">22,050 Hz - speech</option><option value="16000">16,000 Hz - smaller speech</option><option value="8000">8,000 Hz - telephone quality</option></Select></Field>}
      {id==='video-compress'&&<Field label="Maximum output height"><Select value={height} onChange={e=>{setHeight(e.target.value);clearResult();}}><option value="480">480p / 650 kbps</option><option value="360">360p / 650 kbps</option><option value="720">720p / 650 kbps</option></Select></Field>}
      <Button onClick={()=>{if(id==='audio-volume'&&(!Number.isFinite(Number(gain))||Number(gain)<0||Number(gain)>400)){setError('Choose volume between 0 and 400%.');return;}run();}}>{id==='video-frame'?'Capture PNG':'Export '+(videoMode?'video':'WAV')}</Button>
    </fieldset>{busy&&videoMode&&<Button variant="secondary" onClick={()=>stop.current?.()}>Cancel export</Button>}</Panel>}
    {error&&<p role="alert" className="border border-danger p-4 text-sm text-danger">{error}</p>}
    {message&&<p role="status" className="text-sm text-muted">{message}</p>}
    {result&&<Panel title="3 / Your result"><div data-testid="av-result" className="space-y-4"><p className="text-sm">{result.name} · {(result.size/1024).toFixed(1)} KB{files[0]&&` · input ${(files.reduce((n,f)=>n+f.size,0)/1024).toFixed(1)} KB`}</p>{result.type.startsWith('image')?<img src={result.url} alt="Captured video frame" className="max-h-64 max-w-full"/>:result.type.startsWith('video')?<video controls src={result.url} className="max-h-64 w-full"/>:<audio controls src={result.url} className="w-full"/>}<a className="inline-block bg-accent px-4 py-3 text-sm font-semibold text-on-accent" href={result.url} download={result.name}>Download result</a></div></Panel>}
  </div>;
}
