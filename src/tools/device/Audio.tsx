import { useEffect, useRef, useState } from 'react';
import { Button, CopyButton, Field, Input, Note, Panel, Select, Stat } from '../../components/ui';
import { downloadText } from '../../lib/utils';
import {
  clampBpm,
  clampFreq,
  dbfsFromRms,
  detectPitch,
  meterLevel,
  morseToText,
  noteFromFreq,
  textToMorse,
} from '../../lib/device';

type MicState = 'idle' | 'on' | 'error';

function useMic(): {
  state: MicState;
  error: string;
  start: (onStream: (stream: MediaStream, ctx: AudioContext) => void) => Promise<void>;
  stop: () => void;
} {
  const [state, setState] = useState<MicState>('idle');
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const start = async (onStream: (stream: MediaStream, ctx: AudioContext) => void) => {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
      const ctx = new Ctor();
      streamRef.current = stream;
      ctxRef.current = ctx;
      setState('on');
      onStream(stream, ctx);
    } catch (e) {
      setState('error');
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow mic access in the browser address bar and try again.'
        : e instanceof Error ? e.message : 'Could not start the microphone.');
    }
  };
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setState('idle');
  };
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => undefined);
  }, []);
  return { state, error, start, stop };
}

/* ------------------------------------------------------------------ */
/* Sound Level Meter                                                    */
/* ------------------------------------------------------------------ */

export function SoundMeter() {
  const { state, error, start, stop } = useMic();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const liveRef = useRef({ level: 0, avg: 0, max: 0 });
  const [reading, setReading] = useState({ level: 0, avg: 0, max: 0 });

  const begin = () =>
    start((stream, ctx) => {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let samples = 0;
      let sum = 0;
      let last = performance.now();
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        const level = meterLevel(dbfsFromRms(rms));
        samples++;
        sum += level;
        const live = liveRef.current;
        live.level = level;
        live.avg = sum / samples;
        live.max = Math.max(live.max, level);
        if (performance.now() - last > 200) {
          last = performance.now();
          setReading({ level: Math.round(live.level), avg: Math.round(live.avg), max: Math.round(live.max) });
        }
        const canvas = canvasRef.current;
        if (canvas) {
          const g = canvas.getContext('2d');
          if (g) {
            const w = canvas.width;
            const h = canvas.height;
            g.clearRect(0, 0, w, h);
            g.lineWidth = 18;
            g.strokeStyle = 'rgba(128,128,128,0.25)';
            g.beginPath();
            g.arc(w / 2, h - 10, w / 2 - 20, Math.PI, 0);
            g.stroke();
            const frac = live.level / 100;
            g.strokeStyle = frac > 0.8 ? '#dc2626' : frac > 0.55 ? '#d97706' : '#059669';
            g.beginPath();
            g.arc(w / 2, h - 10, w / 2 - 20, Math.PI, Math.PI + Math.PI * frac);
            g.stroke();
            const ang = Math.PI + Math.PI * frac;
            g.strokeStyle = 'currentColor';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(w / 2, h - 10);
            g.lineTo(w / 2 + (w / 2 - 34) * Math.cos(ang), h - 10 + (w / 2 - 34) * Math.sin(ang));
            g.stroke();
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div className="space-y-4">
      <Panel
        title="Live loudness"
        description="Uses your microphone on this device. Audio is never recorded or sent anywhere."
      >
        <canvas ref={canvasRef} width={520} height={280} className="mx-auto block w-full max-w-md text-fg" role="img" aria-label="Sound level gauge" />
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="Now" value={state === 'on' ? String(reading.level) : '--'} />
          <Stat label="Average" value={state === 'on' ? String(reading.avg) : '--'} />
          <Stat label="Peak" value={state === 'on' ? String(reading.max) : '--'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== 'on' ? (
            <Button onClick={() => void begin()}>Start measuring</Button>
          ) : (
            <Button variant="secondary" onClick={() => { cancelAnimationFrame(rafRef.current); stop(); }}>Stop</Button>
          )}
          <Button variant="secondary" onClick={() => { liveRef.current = { level: 0, avg: 0, max: 0 }; setReading({ level: 0, avg: 0, max: 0 }); }}>Reset</Button>
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      </Panel>
      <Note tone="info">
        This is a relative loudness estimate (0-100) from microphone volume, not a calibrated SPL meter. Phone
        microphones apply automatic gain, so use it to compare sounds, not for legal or occupational measurements.
      </Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metronome                                                            */
/* ------------------------------------------------------------------ */

export function Metronome() {
  const [bpm, setBpm] = useState(120);
  const [beats, setBeats] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(-1);
  const tapsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nextBeatRef = useRef({ time: 0, index: 0 });

  const stopClick = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
    setBeat(-1);
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  };

  const startClick = () => {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    nextBeatRef.current = { time: ctx.currentTime + 0.06, index: 0 };
    const tempo = clampBpm(bpm);
    const schedule = () => {
      const c = ctxRef.current;
      if (!c) return;
      while (nextBeatRef.current.time < c.currentTime + 0.12) {
        const { time, index } = nextBeatRef.current;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.frequency.value = index % beats === 0 ? 1568 : 1046;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.5, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
        osc.connect(gain).connect(c.destination);
        osc.start(time);
        osc.stop(time + 0.1);
        const displayAt = Math.max(0, (time - c.currentTime) * 1000);
        const shown = index;
        setTimeout(() => setBeat(shown), displayAt);
        nextBeatRef.current = { time: time + 60 / tempo, index: index + 1 };
      }
    };
    schedule();
    timerRef.current = setInterval(schedule, 25);
    setPlaying(true);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); void ctxRef.current?.close().catch(() => undefined); }, []);

  const tap = () => {
    const now = performance.now();
    const taps = [...tapsRef.current.filter((t) => now - t < 2500), now].slice(-6);
    tapsRef.current = taps;
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(clampBpm(60000 / avg));
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Tempo" description="Accurate Web Audio scheduling keeps the beat steady even if the tab stutters.">
        <p className="py-6 text-center font-mono text-6xl font-semibold" aria-live="polite">
          {bpm}
          <span className="ml-2 text-base text-muted">BPM</span>
        </p>
        <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: beats }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full border border-line ${playing && beat % beats === i ? (i === 0 ? 'bg-accent' : 'bg-fg') : 'bg-raised'}`}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Tempo: ${bpm} BPM`} htmlFor="bpm">
            <input
              id="bpm"
              type="range"
              min={30}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(clampBpm(Number(e.target.value)))}
              className="w-full accent-current"
              aria-label="Tempo in beats per minute"
            />
          </Field>
          <Field label="Beats per bar" htmlFor="beats">
            <Select id="beats" value={String(beats)} onChange={(e) => { setBeats(Number(e.target.value)); setBeat(-1); }}>
              {[2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => (playing ? stopClick() : startClick())}>{playing ? 'Stop' : 'Start'}</Button>
          <Button variant="secondary" onClick={tap}>Tap tempo</Button>
        </div>
      </Panel>
      <Note tone="info">The first beat of each bar is accented with a higher click. Sound plays through this device only.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Instrument Tuner                                                     */
/* ------------------------------------------------------------------ */

export function Tuner() {
  const { state, error, start, stop } = useMic();
  const [note, setNote] = useState<{ name: string; octave: number; cents: number } | null>(null);
  const rafRef = useRef(0);

  const begin = () =>
    start((stream, ctx) => {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);
        const n = freq ? noteFromFreq(freq) : null;
        setNote(n ? { name: n.name, octave: n.octave, cents: n.cents } : null);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const cents = note?.cents ?? 0;
  const inTune = note !== null && Math.abs(cents) <= 5;

  return (
    <div className="space-y-4">
      <Panel title="Tuner" description="Play a single note near the microphone. Works for guitar, violin, ukulele and voice.">
        <div className="py-8 text-center" aria-live="polite">
          <p className={`font-display text-7xl font-semibold ${note ? (inTune ? 'text-success' : 'text-fg') : 'text-muted'}`}>
            {note ? `${note.name}${note.octave}` : '--'}
          </p>
          <p className="mt-2 font-mono text-sm text-muted">
            {note ? `${cents > 0 ? '+' : ''}${cents} cents ${inTune ? '- in tune' : cents > 0 ? '- tune down' : '- tune up'}` : 'Play a note'}
          </p>
        </div>
        <div className="mx-auto h-2 w-full max-w-md border border-line bg-raised" role="img" aria-label="Cents off target">
          <div
            className={`h-full ${inTune ? 'bg-success' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, Math.abs(cents))}%`, marginLeft: cents < 0 ? 'auto' : 0 }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== 'on' ? (
            <Button onClick={() => void begin()}>Start listening</Button>
          ) : (
            <Button variant="secondary" onClick={() => { cancelAnimationFrame(rafRef.current); stop(); setNote(null); }}>Stop</Button>
          )}
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      </Panel>
      <Note tone="info">Background noise confuses pitch detection - tune in a quiet room, one string at a time.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tone Generator                                                       */
/* ------------------------------------------------------------------ */

export function ToneGenerator() {
  const [freq, setFreq] = useState(440);
  const [wave, setWave] = useState<OscillatorType>('sine');
  const [noise, setNoise] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [playing, setPlaying] = useState(false);
  const nodesRef = useRef<{ ctx: AudioContext; gain: GainNode; osc?: OscillatorNode; src?: AudioBufferSourceNode } | null>(null);

  const stopTone = () => {
    const n = nodesRef.current;
    if (n) {
      try { n.osc?.stop(); n.src?.stop(); } catch { /* already stopped */ }
      void n.ctx.close().catch(() => undefined);
      nodesRef.current = null;
    }
    setPlaying(false);
  };

  const startTone = () => {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    gain.connect(ctx.destination);
    const nodes: { ctx: AudioContext; gain: GainNode; osc?: OscillatorNode; src?: AudioBufferSourceNode } = { ctx, gain };
    if (noise) {
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start();
      nodes.src = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = wave;
      const f = clampFreq(freq);
      if (sweep) {
        osc.frequency.setValueAtTime(20, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20000, ctx.currentTime + 12);
      } else {
        osc.frequency.value = f;
      }
      osc.connect(gain);
      osc.start();
      nodes.osc = osc;
    }
    nodesRef.current = nodes;
    setPlaying(true);
  };

  useEffect(() => () => {
    const n = nodesRef.current;
    if (n) {
      try { n.osc?.stop(); n.src?.stop(); } catch { /* already stopped */ }
      void n.ctx.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const n = nodesRef.current;
    if (n?.osc && playing && !sweep) n.osc.frequency.value = clampFreq(freq);
  }, [freq, playing, sweep]);

  return (
    <div className="space-y-4">
      <Panel title="Test tone" description="Sine, square, sawtooth or triangle from 20 Hz to 20 kHz, plus white noise and a full sweep.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frequency (Hz)" htmlFor="freq">
            <Input id="freq" type="number" min={20} max={20000} value={freq} onChange={(e) => setFreq(clampFreq(Number(e.target.value) || 20))} />
          </Field>
          <Field label="Waveform" htmlFor="wave">
            <Select id="wave" value={wave} onChange={(e) => setWave(e.target.value as OscillatorType)} disabled={noise}>
              <option value="sine">Sine</option>
              <option value="square">Square</option>
              <option value="sawtooth">Sawtooth</option>
              <option value="triangle">Triangle</option>
            </Select>
          </Field>
        </div>
        <Field label={`Fine tune: ${freq} Hz`} htmlFor="freq-slider">
          <input
            id="freq-slider"
            type="range"
            min={20}
            max={20000}
            value={freq}
            onChange={(e) => setFreq(clampFreq(Number(e.target.value)))}
            className="w-full accent-current"
            aria-label="Frequency slider"
            disabled={noise || sweep}
          />
        </Field>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} disabled={noise || playing} />
            12-second sweep 20 Hz to 20 kHz
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} disabled={playing} />
            White noise instead of a tone
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => (playing ? stopTone() : startTone())}>{playing ? 'Stop' : 'Play tone'}</Button>
        </div>
      </Panel>
      <Note tone="warning">
        Start at low volume, especially with headphones and low frequencies - sub-bass at high volume can damage
        speakers. Human hearing typically tops out between 12 and 17 kHz.
      </Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text to Speech                                                       */
/* ------------------------------------------------------------------ */

export function TextToSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [text, setText] = useState('The quick brown fox jumps over the lazy dog.');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  const speak = () => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 4000));
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.pitch = pitch;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  if (!supported) {
    return <Note tone="warning">Text to speech is not available in this browser. Try Chrome, Edge or Safari.</Note>;
  }

  return (
    <div className="space-y-4">
      <Panel title="Read text aloud" description="Uses the speech voices already installed on your device - nothing is uploaded.">
        <Field label="Text" htmlFor="tts-text">
          <textarea
            id="tts-text"
            className="min-h-32 w-full border border-line bg-surface p-3 text-sm"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Voice" htmlFor="tts-voice">
            <Select id="tts-voice" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
              <option value="">Device default</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
            </Select>
          </Field>
          <Field label={`Speed: ${rate.toFixed(1)}x`} htmlFor="tts-rate">
            <input id="tts-rate" type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-current" aria-label="Speech speed" />
          </Field>
          <Field label={`Pitch: ${pitch.toFixed(1)}`} htmlFor="tts-pitch">
            <input id="tts-pitch" type="range" min={0.5} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-current" aria-label="Speech pitch" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={speak} disabled={!text.trim()}>{speaking ? 'Restart' : 'Speak'}</Button>
          <Button variant="secondary" onClick={() => { window.speechSynthesis.cancel(); setSpeaking(false); }} disabled={!speaking}>Stop</Button>
        </div>
      </Panel>
      <Note tone="info">The voice list depends on your device and browser. Long text is capped at 4,000 characters per read.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Speech to Text                                                       */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionResultLite { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLite { resultIndex: number; results: SpeechRecognitionResultLite[] & { length: number } }
interface SpeechRecognitionLite {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLite) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function SpeechToText() {
  const Ctor = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLite; webkitSpeechRecognition?: new () => SpeechRecognitionLite }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLite }).webkitSpeechRecognition)
    : undefined;
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLite | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    if (!Ctor) return;
    setError('');
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-IN';
    rec.onresult = (event) => {
      let interimPart = '';
      let finalPart = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalPart += r[0].transcript;
        else interimPart += r[0].transcript;
      }
      if (finalPart) setFinalText((t) => (t ? t + ' ' : '') + finalPart.trim());
      setInterim(interimPart);
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed'
        ? 'Microphone permission was denied. Allow mic access and try again.'
        : `Recognition error: ${e.error}.`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Could not start speech recognition.');
    }
  };

  if (!Ctor) {
    return (
      <Note tone="warning">
        Live dictation needs the Web Speech API, which this browser does not expose. It works in Chrome and Edge on
        desktop and Android. Audio never leaves your device beyond the browser's own speech service.
      </Note>
    );
  }

  const combined = (finalText + (interim ? (finalText ? ' ' : '') + interim : '')).trim();

  return (
    <div className="space-y-4">
      <Panel title="Dictation" description={`Listening in ${navigator.language || 'en-IN'}. Chrome and Edge send audio to their speech service; other text work stays local.`}>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={toggle}>{listening ? 'Stop dictation' : 'Start dictation'}</Button>
          {listening && <span className="flex items-center gap-2 text-sm text-danger"><span className="h-2 w-2 animate-pulse rounded-full bg-danger" />Listening...</span>}
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
        {combined && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="label text-muted">Transcript</p>
              <div className="flex gap-2">
                <CopyButton value={combined} />
                <Button variant="secondary" onClick={() => downloadText('toolatlas-transcript.txt', combined)}>Download .txt</Button>
                <Button variant="secondary" onClick={() => { setFinalText(''); setInterim(''); }}>Clear</Button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap border border-line bg-raised p-4 text-sm" data-testid="transcript">
              {finalText}
              {interim && <span className="text-muted"> {interim}</span>}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Morse Code                                                           */
/* ------------------------------------------------------------------ */

export function Morse() {
  const [input, setInput] = useState('SOS');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [wpm, setWpm] = useState(18);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef(false);

  const output = mode === 'encode' ? textToMorse(input) : morseToText(input);

  useEffect(() => () => {
    stopRef.current = true;
    void ctxRef.current?.close().catch(() => undefined);
  }, []);

  const play = async () => {
    const code = mode === 'encode' ? output : textToMorse(output.toUpperCase());
    if (!code) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    stopRef.current = false;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    setPlaying(true);
    const unit = 1.2 / Math.min(40, Math.max(5, wpm)); // dit length in seconds from words per minute
    let t = ctx.currentTime + 0.08;
    const beep = (start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 650;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    for (const ch of code) {
      if (stopRef.current) break;
      if (ch === '.') { beep(t, unit); t += unit * 2; }
      else if (ch === '-') { beep(t, unit * 3); t += unit * 4; }
      else if (ch === ' ') t += unit * 2; // gap between letters (one unit already counted)
      else if (ch === '/') t += unit * 7; // gap between words
    }
    const wait = (t - ctx.currentTime) * 1000;
    setTimeout(() => { setPlaying(false); void ctx.close().catch(() => undefined); }, Math.max(0, wait));
  };

  const stopPlay = () => {
    stopRef.current = true;
    setPlaying(false);
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  };

  return (
    <div className="space-y-4">
      <Panel title="Morse translator" description="Letters separated by spaces, words by a slash. Unsupported characters are skipped.">
        <div className="mb-4 flex gap-2" role="tablist" aria-label="Conversion direction">
          <Button variant={mode === 'encode' ? 'primary' : 'secondary'} onClick={() => setMode('encode')}>Text to Morse</Button>
          <Button variant={mode === 'decode' ? 'primary' : 'secondary'} onClick={() => setMode('decode')}>Morse to Text</Button>
        </div>
        <Field label={mode === 'encode' ? 'Text' : 'Morse code'} htmlFor="morse-input">
          <Input id="morse-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} />
        </Field>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="label text-muted">{mode === 'encode' ? 'Morse code' : 'Decoded text'}</p>
            {output && <CopyButton value={output} />}
          </div>
          <p className="mt-2 min-h-12 whitespace-pre-wrap break-words border border-line bg-raised p-4 font-mono text-lg" data-testid="morse-output">{output || '--'}</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={`Speed: ${wpm} WPM`} htmlFor="wpm">
            <input id="wpm" type="range" min={5} max={40} value={wpm} onChange={(e) => setWpm(Math.min(40, Math.max(5, Number(e.target.value))))} className="w-full accent-current" aria-label="Words per minute" />
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={() => void play()} disabled={playing || !output}>Play beeps</Button>
            <Button variant="secondary" onClick={stopPlay} disabled={!playing}>Stop</Button>
          </div>
        </div>
      </Panel>
      <Note tone="info">Timing follows standard Morse rules: a dash is three dots, letter gaps are three dots and word gaps are seven.</Note>
    </div>
  );
}
