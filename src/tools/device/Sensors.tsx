import { useEffect, useRef, useState } from 'react';
import { Button, Field, Note, Panel, Select, Stat } from '../../components/ui';
import {
  DEFAULT_PX_PER_MM,
  SPEED_UNIT_LABEL,
  cardinalFromHeading,
  formatSpeed,
  haversineM,
  rulerTicks,
  type SpeedUnit,
} from '../../lib/device';

interface OrientationPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

type SensorState = 'idle' | 'on' | 'unsupported' | 'denied';

function useOrientation(listener: (e: DeviceOrientationEvent) => void): { state: SensorState; enable: () => Promise<void> } {
  const [state, setState] = useState<SensorState>('idle');
  const savedRef = useRef(listener);
  savedRef.current = listener;
  const enable = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setState('unsupported');
      return;
    }
    try {
      const withPermission = DeviceOrientationEvent as unknown as OrientationPermission;
      if (typeof withPermission.requestPermission === 'function') {
        const result = await withPermission.requestPermission();
        if (result !== 'granted') {
          setState('denied');
          return;
        }
      }
      const handler = (e: DeviceOrientationEvent) => savedRef.current(e);
      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler, true);
      setState('on');
      setTimeout(() => {
        setState((s) => (s === 'on' ? s : s));
      }, 2000);
    } catch {
      setState('denied');
    }
  };
  return { state, enable };
}

/* ------------------------------------------------------------------ */
/* Compass                                                              */
/* ------------------------------------------------------------------ */

export function Compass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);
  const { state, enable } = useOrientation((e) => {
    const webkitHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const deg = typeof webkitHeading === 'number' ? webkitHeading : e.alpha != null ? (360 - e.alpha) % 360 : null;
    if (deg != null && Number.isFinite(deg)) {
      setHeading(deg);
      setSeen(true);
    }
  });

  return (
    <div className="space-y-4">
      <Panel title="Compass" description="Reads your phone's magnetometer through the motion sensors. Keep away from magnets and metal cases.">
        <div className="py-6 text-center" aria-live="polite">
          <p className="font-display text-6xl font-semibold">
            {heading != null ? `${Math.round(heading)}°` : '--'}
            <span className="ml-3 text-2xl text-muted">{heading != null ? cardinalFromHeading(heading) : ''}</span>
          </p>
        </div>
        <div className="relative mx-auto h-48 w-48 rounded-full border border-line bg-raised" role="img" aria-label="Compass dial">
          {['N', 'E', 'S', 'W'].map((d, i) => (
            <span key={d} className="absolute font-mono text-xs text-muted" style={{ top: i === 0 ? 6 : i === 2 ? 'auto' : '50%', bottom: i === 2 ? 6 : 'auto', left: i === 3 ? 8 : i === 1 ? 'auto' : '50%', right: i === 1 ? 8 : 'auto', transform: i % 2 === 0 ? 'translateX(-50%)' : 'translateY(-50%)' }}>{d}</span>
          ))}
          <div
            className="absolute inset-0 transition-transform duration-150"
            style={{ transform: `rotate(${heading != null ? -heading : 0}deg)` }}
          >
            <div className="absolute left-1/2 top-2 h-8 w-1 -translate-x-1/2 bg-danger" />
          </div>
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== 'on' && <Button onClick={() => void enable()}>Enable compass</Button>}
        </div>
        {state === 'unsupported' && <p role="alert" className="mt-4 text-danger">This browser does not expose motion sensors. A phone browser is needed for a live compass.</p>}
        {state === 'denied' && <p role="alert" className="mt-4 text-danger">Motion sensor permission was denied. Allow it in your browser settings and try again.</p>}
        {state === 'on' && !seen && <p className="mt-4 text-sm text-muted">Waiting for sensor data. On a laptop without a magnetometer the dial stays still.</p>}
      </Panel>
      <Note tone="info">Heading is magnetic, not true north. Accuracy depends on your phone's sensor calibration - wave the phone in a figure-eight if readings look stuck.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spirit Level                                                         */
/* ------------------------------------------------------------------ */

export function SpiritLevel() {
  const [tilt, setTilt] = useState<{ beta: number; gamma: number } | null>(null);
  const [zero, setZero] = useState({ beta: 0, gamma: 0 });
  const [seen, setSeen] = useState(false);
  const { state, enable } = useOrientation((e) => {
    if (e.beta != null && e.gamma != null) {
      setTilt({ beta: e.beta, gamma: e.gamma });
      setSeen(true);
    }
  });

  const x = tilt ? tilt.gamma - zero.gamma : 0;
  const y = tilt ? tilt.beta - zero.beta : 0;
  const flat = Math.abs(x) <= 1 && Math.abs(y) <= 1;

  return (
    <div className="space-y-4">
      <Panel title="Bubble level" description="Lay the phone flat on the surface. The bubble drifts toward the high side, like a real level.">
        <div className="relative mx-auto mt-2 h-64 w-64 rounded-full border border-line bg-raised" role="img" aria-label="Bubble level">
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
          {tilt && (
            <div
              className={`absolute h-12 w-12 rounded-full border ${flat ? 'border-success bg-success/40' : 'border-accent bg-accent/30'}`}
              style={{
                left: `calc(50% + ${Math.max(-96, Math.min(96, x * 5))}px)`,
                top: `calc(50% + ${Math.max(-96, Math.min(96, y * 5))}px)`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <Stat label="Left-right tilt" value={tilt ? `${x.toFixed(1)}°` : '--'} />
          <Stat label="Front-back tilt" value={tilt ? `${y.toFixed(1)}°` : '--'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== 'on' && <Button onClick={() => void enable()}>Enable level</Button>}
          <Button variant="secondary" disabled={!tilt} onClick={() => tilt && setZero({ beta: tilt.beta, gamma: tilt.gamma })}>Set zero here</Button>
          <Button variant="secondary" onClick={() => setZero({ beta: 0, gamma: 0 })}>Clear zero</Button>
        </div>
        {state === 'unsupported' && <p role="alert" className="mt-4 text-danger">This browser does not expose motion sensors. A phone browser is needed.</p>}
        {state === 'denied' && <p role="alert" className="mt-4 text-danger">Motion sensor permission was denied. Allow it in your browser settings and try again.</p>}
        {state === 'on' && !seen && <p className="mt-4 text-sm text-muted">Waiting for sensor data from your phone.</p>}
      </Panel>
      <Note tone="info">Phone cases and camera bumps add tilt - take the phone out of its case and calibrate zero on a surface you trust.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GPS Speedometer                                                      */
/* ------------------------------------------------------------------ */

export function GpsSpeedometer() {
  const [unit, setUnit] = useState<SpeedUnit>('kmh');
  const [speed, setSpeed] = useState<number | null>(null);
  const [max, setMax] = useState(0);
  const [distance, setDistance] = useState(0);
  const [state, setState] = useState<'idle' | 'on' | 'error' | 'unsupported'>('idle');
  const [error, setError] = useState('');
  const watchRef = useRef<number | null>(null);
  const lastRef = useRef<{ lat: number; lon: number } | null>(null);

  const stopWatch = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setState('idle');
  };

  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  const startWatch = () => {
    if (!('geolocation' in navigator)) {
      setState('unsupported');
      return;
    }
    setError('');
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: rawSpeed } = pos.coords;
        let mps = rawSpeed;
        const last = lastRef.current;
        if (last) {
          const d = haversineM(last.lat, last.lon, latitude, longitude);
          if (d < 100) setDistance((prev) => prev + d);
        }
        lastRef.current = { lat: latitude, lon: longitude };
        if (mps == null || mps < 0) mps = 0;
        setSpeed(mps);
        setMax((m) => Math.max(m, mps ?? 0));
        setState('on');
      },
      (err) => {
        setState('error');
        setError(err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access and try again.'
          : 'Could not get a GPS fix. Move outdoors with a clear view of the sky.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };

  const distText = distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`;

  return (
    <div className="space-y-4">
      <Panel title="Live speed" description="Speed comes from GPS satellites, so it works in a car, train, bus or on a cycle - not indoors.">
        <p className="py-6 text-center" aria-live="polite">
          <span className="font-display text-7xl font-semibold">{formatSpeed(speed, unit)}</span>
          <span className="ml-2 text-xl text-muted">{SPEED_UNIT_LABEL[unit]}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Top speed" value={`${formatSpeed(max, unit)} ${SPEED_UNIT_LABEL[unit]}`} />
          <Stat label="Trip distance" value={distText} />
          <Field label="Units" htmlFor="speed-unit">
            <Select id="speed-unit" value={unit} onChange={(e) => setUnit(e.target.value as SpeedUnit)}>
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="kn">knots</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {state !== 'on' ? <Button onClick={startWatch}>Start GPS</Button> : <Button variant="secondary" onClick={stopWatch}>Stop</Button>}
          <Button variant="secondary" onClick={() => { setMax(0); setDistance(0); }}>Reset trip</Button>
        </div>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
        {state === 'unsupported' && <p role="alert" className="mt-4 text-danger">This browser has no geolocation support.</p>}
      </Panel>
      <Note tone="info">GPS speed lags a second or two behind real speed and needs a view of the sky. Do not operate your phone while driving.</Note>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen Ruler                                                         */
/* ------------------------------------------------------------------ */

export function ScreenRuler() {
  const [pxMm, setPxMm] = useState(DEFAULT_PX_PER_MM);
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const [calWidth, setCalWidth] = useState(300);
  const saved = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('toolatlas-ruler-pxmm')) : 0;

  useEffect(() => {
    if (saved > 1 && saved < 30) setPxMm(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lengthMm = 160;
  const ticks = rulerTicks(lengthMm);
  const pxPerUnit = unit === 'cm' ? pxMm * 10 : pxMm * 25.4;
  const cardMm = 85.6; // ISO/IEC 7810 ID-1 card width

  const calibrate = () => {
    const next = calWidth / cardMm;
    setPxMm(next);
    try { localStorage.setItem('toolatlas-ruler-pxmm', String(next)); } catch { /* storage blocked is fine */ }
  };

  return (
    <div className="space-y-4">
      <Panel title="Ruler" description="Hold an object against the screen. Calibrate below first - every screen shows a different pixel size.">
        <div className="mb-3 flex items-center gap-3">
          <Select aria-label="Ruler units" value={unit} onChange={(e) => setUnit(e.target.value as 'cm' | 'in')}>
            <option value="cm">centimetres</option>
            <option value="in">inches</option>
          </Select>
          <p className="text-sm text-muted" data-testid="ruler-scale">1 {unit === 'cm' ? 'cm' : 'inch'} = {Math.round(pxPerUnit)} px on this screen</p>
        </div>
        <div className="overflow-x-auto border border-line bg-surface p-2">
          <div className="relative h-16" style={{ width: lengthMm * pxMm }} role="img" aria-label="Ruler">
            {ticks.filter((t) => (unit === 'cm' ? true : t.mm % 2 === 0)).map((t) => (
              <div key={t.mm} className="absolute bottom-0 border-l border-fg" style={{ left: t.mm * pxMm, height: t.label ? 40 : t.mm % 5 === 0 ? 26 : 14 }}>
                {t.label && <span className="absolute -left-1 font-mono text-[9px] text-muted" style={{ top: -16 }}>{unit === 'cm' ? t.mm / 10 : (t.mm / 25.4).toFixed(1)}</span>}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Calibrate with a bank card" description="A bank or ID card is exactly 85.6 x 54 mm. Hold the card's long edge against the box below and drag until the widths match.">
        <div className="mx-auto mb-3 border-2 border-accent" style={{ width: calWidth, height: Math.round(calWidth * 53.98 / 85.6) }} aria-hidden="true" />
        <Field label={`Card width on screen: ${calWidth}px`} htmlFor="cal">
          <input id="cal" type="range" min={150} max={700} value={calWidth} onChange={(e) => setCalWidth(Number(e.target.value))} className="w-full accent-current" aria-label="Calibration width" />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={calibrate}>Apply calibration</Button>
          <Button variant="secondary" onClick={() => { setPxMm(DEFAULT_PX_PER_MM); try { localStorage.removeItem('toolatlas-ruler-pxmm'); } catch { /* ignore */ } }}>Reset to default</Button>
        </div>
      </Panel>
      <Note tone="info">Browsers report logical pixels, so an uncalibrated on-screen ruler can be 10-30% off. After calibrating once, the setting is saved on this device.</Note>
    </div>
  );
}
