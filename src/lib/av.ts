/** Browser-only media helpers. No codec download or server processing. */
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export function range(start: number, end: number, duration: number) {
  if (![start, end, duration].every(Number.isFinite) || start < 0 || end <= start || end > duration + .001) throw new Error('Choose a start before the end, within the file duration.');
  return [Math.floor(start), Math.ceil(end)];
}
export function wav(channels: Float32Array[], sampleRate: number): Blob {
  if (!channels.length || channels.length > 2 || channels.some(c => c.length !== channels[0].length)) throw new Error('Invalid audio channels.');
  const length = channels[0].length, bytes = length * channels.length * 2;
  const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels.length * 2, true); view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true);
  for (let i = 0; i < length; i++) for (let c = 0; c < channels.length; c++) { const v = Math.max(-1, Math.min(1, channels[c][i])); view.setInt16(44 + (i * channels.length + c) * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true); }
  return new Blob([buffer], { type: 'audio/wav' });
}
export function transformAudio(channels: Float32Array[], start: number, end: number, rate: number, gain: number, normalize: boolean, reverse: boolean, fade: boolean) {
  range(start, end, channels[0].length / rate);
  const out = channels.map(c => c.slice(Math.round(start * rate), Math.round(end * rate)));
  let peak = 0; for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
  const scale = normalize && peak > 0 ? .98 / peak : gain;
  for (const c of out) {
    if (reverse) c.reverse();
    for (let i = 0; i < c.length; i++) { const envelope = fade ? Math.min(1, i / Math.max(1, rate * .05), (c.length - 1 - i) / Math.max(1, rate * .05)) : 1; c[i] = Math.max(-1, Math.min(1, c[i] * scale * envelope)); }
  }
  return out;
}
export function recordingMime(video: boolean) {
  if (typeof MediaRecorder === 'undefined') return '';
  return (video ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']).find(m => MediaRecorder.isTypeSupported(m)) || '';
}
export async function decodeAudio(file: File, ctx: AudioContext) {
  if (file.size > AUDIO_MAX_BYTES) throw new Error('Keep each input under 50 MB.');
  let buffer: AudioBuffer;
  try { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); } catch { throw new Error('Your browser cannot decode this file. Try MP3, WAV, M4A, OGG or a different browser.'); }
  if (buffer.duration > 300 || buffer.numberOfChannels > 2) throw new Error('Use mono/stereo audio up to 5 minutes.');
  return buffer;
}
