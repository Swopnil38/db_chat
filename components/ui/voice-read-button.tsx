import { useState, useRef } from "react";
import { Volume2 } from "lucide-react";

interface VoiceReadButtonProps {
  text: string;
}

export default function VoiceReadButton({ text }: VoiceReadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleReadOrStop = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("text", text);
      const res = await fetch("/api/text-to-speech/", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsPlaying(true);
        audio.play();
        audio.onended = () => {
          setIsPlaying(false);
        };
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-start ml-2 mt-2">
      <button
        type="button"
        onClick={handleReadOrStop}
        className={`text-blue-600 hover:text-blue-700 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={isPlaying ? "Stop read aloud" : "Read aloud"}
        disabled={loading}
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        <Volume2 size={18} />
      </button>
    </div>
  );
}