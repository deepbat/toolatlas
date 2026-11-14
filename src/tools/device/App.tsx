import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { Metronome, Morse, SoundMeter, SpeechToText, TextToSpeech, ToneGenerator, Tuner } from './Audio';
import { Compass, GpsSpeedometer, ScreenRuler, SpiritLevel } from './Sensors';
import { QrScanner, ScreenRecorder } from './Capture';

const COMPONENTS: Record<string, ComponentType> = {
  'sound-meter': SoundMeter,
  metronome: Metronome,
  tuner: Tuner,
  'tone-generator': ToneGenerator,
  'text-to-speech': TextToSpeech,
  'speech-to-text': SpeechToText,
  compass: Compass,
  'spirit-level': SpiritLevel,
  'gps-speedometer': GpsSpeedometer,
  'screen-ruler': ScreenRuler,
  'morse-code': Morse,
  'qr-barcode-scanner': QrScanner,
  'screen-recorder': ScreenRecorder,
};

export default function DeviceApp() {
  const { toolId } = useParams();
  const Component = toolId ? COMPONENTS[toolId] : undefined;
  if (!Component) return <p className="text-sm text-muted">Unknown device tool.</p>;
  return <Component />;
}
