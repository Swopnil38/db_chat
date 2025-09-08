"use client";
import { useEffect, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { setText, setLoading, setError } from "@/store/features/speechToTextSlice";
import { Mic, Square } from "lucide-react";

export default function VoiceInput() {
  const dispatch = useAppDispatch();
  const [volume, setVolume] = useState(0);
  const [listening, setListening] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Log listening state changes
  useEffect(() => {
    console.log('[VoiceInput] Listening state changed:', listening);
  }, [listening, audioChunks]);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let rafId: number;
    let localStream: MediaStream | null = null;

    if (listening) {
      if (
        typeof window !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
      ) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then((stream) => {
            localStream = stream;
            // Volume visualization
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 64;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const update = () => {
              analyser!.getByteFrequencyData(dataArray);
              const max = Math.max(...dataArray);
              setVolume(max);
              rafId = requestAnimationFrame(update);
            };
            update();

            // Audio recording
            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(stream);
            setMediaRecorder(recorder);
            setAudioChunks([]);
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                console.log('[VoiceInput] Audio chunk collected:', e.data.size, 'bytes');
                chunks.push(e.data);
              }
            };
            recorder.onstop = async () => {
              console.log('[VoiceInput] MediaRecorder stopped, sending audio...');
              if (chunks.length === 0) return;
              dispatch(setLoading(true));
              const audioBlob = new Blob(chunks, { type: 'audio/webm' });
              let fileBlob = audioBlob;
              let filename = 'recording.webm';
              // Try to convert to wav
              const wavBlob = await convertWebmToWav(audioBlob);
              if (wavBlob.type === 'audio/wav') {
                fileBlob = wavBlob;
                filename = 'recording.wav';
              }
              const formData = new FormData();
              formData.append('audio', fileBlob, filename);
              console.log('[VoiceInput] Attempting to send audio:', { filename, size: fileBlob.size, type: fileBlob.type });
              try {
                const res = await fetch('/api/speech-to-text/', {
                  method: 'POST',
                  body: formData,
                });
                console.log('[VoiceInput] Response status:', res.status);
                if (!res.ok) throw new Error('Failed to send audio');
                const data = await res.json();
                console.log('[VoiceInput] Response data:', data);
                if (data && data.text) {
                  dispatch(setText(data.text));
                } else {
                  dispatch(setError('No text recognized.'));
                }
              } catch (err: any) {
                console.error('[VoiceInput] Error sending audio:', err);
                dispatch(setError('Error sending audio: ' + err.message));
              } finally {
                setMediaRecorder(null);
                setAudioChunks([]);
              }
            };
            recorder.start();
            console.log('[VoiceInput] MediaRecorder started');
          })
          .catch((err) => {
            setListening(false);
            setVolume(0);
            console.error("getUserMedia error:", err);
          });
      } else {
        setListening(false);
        setVolume(0);
        dispatch(setError('Audio recording is not supported in this environment.'));
        console.error('Audio recording is not supported in this environment.');
      }
    }
    return () => {
      cancelAnimationFrame(rafId);
      if (audioCtx) audioCtx.close();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // Helper: Convert webm Blob to wav using AudioContext (best effort)
  async function convertWebmToWav(webmBlob: Blob): Promise<Blob> {
    try {
      const arrayBuffer = await webmBlob.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      // PCM to WAV encoding
      const wavBuffer = encodeWAV(audioBuffer);
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (e) {
      // Fallback to webm if conversion fails
      return webmBlob;
    }
  }

  // Helper: Encode AudioBuffer to WAV (PCM 16-bit)
  function encodeWAV(audioBuffer: AudioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const samples = audioBuffer.length * numChannels;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);

    function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + samples * 2, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * bitDepth / 8, true); offset += 4;
    view.setUint16(offset, numChannels * bitDepth / 8, true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, samples * 2, true); offset += 4;

    // Interleave channels
    let pos = offset;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = audioBuffer.getChannelData(ch)[i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        pos += 2;
      }
    }
    return buffer;
  }



  return (
    <div className="flex items-center gap-2">
      {!listening && (
        <button
          onClick={() => setListening((prev) => !prev)}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          className={`flex items-center justify-center w-12 h-[60px] rounded-xl border border-gray-200 bg-white transition-colors ${listening ? 'text-primary' : 'text-gray-500'} hover:text-primary focus:outline-none`}
          type="button"
        >
          <Mic size={24} />
        </button>
      )}
      {listening && (
        <>
          {/* Animated horizontal volume bar */}
          <div
            aria-label="Recording"
            className="flex items-center h-[60px]"
            style={{ width: '32px', marginRight: '4px' }}
          >
            <div
              style={{
                width: '100%',
                // Minimum height 8px, maximum 40px, scale volume between 0-40
                height: `${Math.max(8, Math.min(40, volume / 2))}px`,
                background: '#3b82f6',
                borderRadius: '4px',
                transition: 'height 0.1s',
                alignSelf: 'center',
              }}
            />
          </div>
          <button
            onClick={() => setListening(false)}
            aria-label="Pause voice input"
            className="flex items-center justify-center w-12 h-[60px] rounded-xl border border-gray-200 bg-white text-red-500 hover:text-red-700 transition-colors focus:outline-none"
            type="button"
          >
            <Square size={24} />
          </button>
        </>
      )}
    </div>
  );
}