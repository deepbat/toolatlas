import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { Metronome, Morse, SoundMeter, TextToSpeech, ToneGenerator, Tuner } from './Audio';
import { Compass, GpsSpeedometer, ScreenRuler, SpiritLevel } from './Sensors';
import { QrScanner } from './Capture';

const COMPONENTS: Record<string, ComponentType> = {
  'sound-meter': SoundMeter,
  metronome: Metronome,
  tuner: Tuner,
  'tone-generator': ToneGenerator,
  'text-to-speech': TextToSpeech,
  compass: Compass,
  'spirit-level': SpiritLevel,
  'gps-speedometer': GpsSpeedometer,
  'screen-ruler': ScreenRuler,
  'morse-code': Morse,
  'qr-barcode-scanner': QrScanner,
};

export default function DeviceApp() {
  const { toolId } = useParams();
  const Component = toolId ? COMPONENTS[toolId] : undefined;
  if (!Component) return <p className="text-sm text-muted">Unknown device tool.</p>;
  return <Component />;
}
