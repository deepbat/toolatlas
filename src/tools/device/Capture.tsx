import { useEffect, useRef, useState } from 'react';
import { Button, CopyButton, Note, Panel } from '../../components/ui';

interface BarcodeDetectorResult { rawValue: string; format: string }
interface BarcodeDetectorLite {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLite;
  getSupportedFormats?: () => Promise<string[]>;
}

function barcodeCtor(): BarcodeDetectorCtor | undefined {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

/* ------------------------------------------------------------------ */
/* QR & Barcode Scanner                                                 */
/* ------------------------------------------------------------------ */

export function QrScanner() {
  const supported = typeof window !== 'undefined' && Boolean(barcodeCtor());
  const [results, setResults] = useState<{ value: string; format: string; at: number }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushResult = (value: string, format: string) => {
    setResults((prev) => (prev[0]?.value === value ? prev : [{ value, format, at: Date.now() }, ...prev].slice(0, 10)));
  };

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const startCamera = async () => {
    const Ctor = barcodeCtor();
    if (!Ctor) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Camera view is not ready.');
      video.srcObject = stream;
      await video.play();
      const detector = new Ctor();
      timerRef.current = setInterval(() => {
        void detector
          .detect(video)
          .then((codes) => codes.forEach((c) => pushResult(c.rawValue, c.format)))
          .catch(() => undefined);
      }, 600);
      setScanning(true);
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : e instanceof Error ? e.message : 'Could not start the camera.');
      stopCamera();
    }
  };

  const scanImage = async (file: File) => {
    const Ctor = barcodeCtor();
    if (!Ctor) return;
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new Ctor().detect(bitmap);
      if (codes.length === 0) setError('No code found in that image. Try a sharper, well-lit photo.');
      codes.forEach((c) => pushResult(c.rawValue, c.format));
    } catch {
      setError('Could not read that image. Try a different photo.');
    }
  };

  if (!supported) {
    return (
      <Note tone="warning">
        Live code scanning needs the Barcode Detection API, available in Chrome and Edge on Android and desktop.
        On iPhone, open the Camera app instead - iOS scans QR codes natively.
      </Note>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Scan a code" description="Decoding runs entirely on this device. Point the camera at a QR or barcode, or upload a photo of one.">
        <video ref={videoRef} className={`w-full border border-line bg-black ${scanning ? '' : 'hidden'}`} muted playsInline aria-label="Camera viewfinder" />
        <div className="mt-3 flex flex-wrap gap-2">
          {scanning ? (
            <Button variant="secondary" onClick={stopCamera}>Stop camera</Button>
          ) : (
            <Button onClick={() => void startCamera()}>Start camera</Button>
          )}
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent">
            Scan from photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanImage(f); e.target.value = ''; }} />
          </label>
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      </Panel>
      {results.length > 0 && (
        <Panel title="Scanned codes">
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.at + r.value} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <span className="min-w-0 break-all font-mono text-sm">{r.value}
                  <span className="ml-2 text-[10px] uppercase text-muted">{r.format.replace(/_/g, ' ')}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <CopyButton value={r.value} />
                  {/^https?:\/\//.test(r.value) && (
                    <a href={r.value} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] uppercase tracking-label text-accent">Open ↗</a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Note tone="info">Only open scanned links you recognise - a QR code can point anywhere. ToolAtlas shows the raw text so you can check it first.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen Recorder                                                      */
/* ------------------------------------------------------------------ */

export function ScreenRecorder() {
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia) && typeof MediaRecorder !== 'undefined';
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [withMic, setWithMic] = useState(false);
  const [error, setError] = useState('');
  const [video, setVideo] = useState<{ url: string; size: number } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const mixRef = useRef<AudioContext | null>(null);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    void mixRef.current?.close().catch(() => undefined);
    mixRef.current = null;
  };

  useEffect(() => () => {
    cleanup();
    if (video) URL.revokeObjectURL(video.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = () => {
    recRef.current?.stop();
  };

  const startRecording = async () => {
    setError('');
    setVideo((v) => { if (v) URL.revokeObjectURL(v.url); return null; });
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const tracks: MediaStreamTrack[] = [...display.getTracks()];
      streamsRef.current = [display];
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(mic);
          const Ctor: typeof AudioContext | undefined =
            window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctor) {
            const ctx = new Ctor();
            mixRef.current = ctx;
            const dest = ctx.createMediaStreamDestination();
            if (display.getAudioTracks().length) ctx.createMediaStreamSource(display).connect(dest);
            ctx.createMediaStreamSource(mic).connect(dest);
            tracks.push(...dest.stream.getAudioTracks());
          } else {
            tracks.push(...mic.getAudioTracks());
          }
        } catch {
          setError('Microphone was not shared, recording screen audio only.');
        }
      }
      const combined = new MediaStream(tracks);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec = new MediaRecorder(combined, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (blob.size) setVideo({ url: URL.createObjectURL(blob), size: blob.size });
        setRecording(false);
        setSeconds(0);
        cleanup();
      };
      display.getVideoTracks()[0]?.addEventListener('ended', () => rec.state !== 'inactive' && rec.stop());
      rec.start(1000);
      recRef.current = rec;
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setError('Screen share was cancelled or denied. Choose a screen, window or tab to record.');
      } else {
        setError(e instanceof Error ? e.message : 'Could not start the recording.');
      }
      cleanup();
    }
  };

  if (!supported) {
    return (
      <Note tone="warning">
        Screen recording needs Chrome, Edge or another Chromium browser on desktop. Safari and most phone browsers
        do not support screen capture.
      </Note>
    );
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <Panel title="Record your screen" description="The browser asks which screen, window or tab to share. The video is assembled on this device and never uploaded.">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withMic} onChange={(e) => setWithMic(e.target.checked)} disabled={recording} />
          Include microphone narration
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {recording ? (
            <>
              <Button variant="danger" onClick={stopRecording}>Stop recording</Button>
              <span className="flex items-center gap-2 font-mono text-sm text-danger">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />REC {clock}
              </span>
            </>
          ) : (
            <Button onClick={() => void startRecording()}>Start recording</Button>
          )}
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      </Panel>
      {video && (
        <Panel title="Your recording">
          <video src={video.url} controls className="w-full border border-line bg-black" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={video.url} download="toolatlas-screen-recording.webm" className="inline-flex items-center justify-center gap-2 border border-transparent bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent shadow-soft transition hover:brightness-110">Download WebM ({(video.size / 1048576).toFixed(1)} MB)</a>
          </div>
        </Panel>
      )}
      <Note tone="info">
        Recordings are saved as WebM, which Chrome, Edge, VLC and most editors play directly. Recording system audio
        works for browser tabs on most systems; window capture may be video-only.
      </Note>
    </div>
  );
}
