import type {ToolMeta} from './types';
const rows = [
 ['video-trim','Video Trimmer','Keep a selected time range and export a new video.','video'],
 ['video-compress','Video Compressor','Reduce resolution and bitrate for a smaller video. Savings depend on the source.','video'],
 ['video-mute','Mute Video','Save a video without its audio track, processed locally on your device.','video'],
 ['video-frame','Video to Image','Pick a moment and save a full-resolution PNG still.','video'],
 ['video-audio','Extract Audio from Video','Save the audio of a browser-supported video as a WAV file.','video'],
 ['audio-trim','Audio Cutter','Trim songs, voice notes and ringtones with optional edge fades. WAV output.','audio'],
 ['audio-convert','Audio to WAV','Convert browser-supported MP3, M4A, OGG and other audio to PCM WAV.','audio'],
 ['audio-merge','Audio Joiner','Put up to eight clips in your chosen order and save one WAV.','audio'],
 ['audio-volume','Audio Volume & Normalize','Change gain or peak-normalize a quiet recording. WAV output.','audio'],
 ['audio-reverse','Reverse Audio','Play an audio clip backwards and save it as WAV.','audio'],
 ['audio-size','WAV Size Reducer','Reduce WAV sample rate and mix stereo to mono for smaller speech files.','audio'],
 ['voice-recorder','Voice Recorder','Record your microphone locally, preview and download the recording.','audio'],
] as const;
export const AV_TOOLS: ToolMeta[] = rows.map(([id,name,description,category]) => ({id,name,description,category,icon:category==='video'?'Video':'Music',keywords:[...name.toLowerCase().split(/\W+/),'media','local',category,...(id==='audio-trim'?['ringtone','mp3 cutter']:[])],version:'1.0.0',status:'beta',added:'2026-11-13',layout:'wide'}));
