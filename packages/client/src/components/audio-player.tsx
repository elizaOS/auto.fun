import { useState } from "react";
import CopyButton from "./copy-button";

interface AudioPlayerProps {
  src: string;
  albumArt?: string;
  lyrics?: string;
  showControls?: boolean;
  className?: string;
}

export default function AudioPlayer({
  src,
  albumArt,
  lyrics,
  showControls = true,
  className = "",
}: AudioPlayerProps) {
  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const [editableLyrics, setEditableLyrics] = useState(lyrics);

  return (
    <div
      className={`flex flex-col gap-4 border border-gray-700 p-0 bg-black ${className}`}
    >
      {albumArt && (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-1/2 aspect-square">
            <img
              src={albumArt}
              alt="Album Art"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>

          {lyrics && (
            <div className="w-full md:w-1/2 h-[400px] relative">
              <div className="absolute top-0 right-0 z-10 flex gap-2">
                <CopyButton text={editableLyrics || ""} />
                <button
                  onClick={() => setIsEditingLyrics(!isEditingLyrics)}
                  className="p-1 bg-gray-700 rounded hover:bg-gray-600"
                >
                  {isEditingLyrics ? "Save" : "Edit"}
                </button>
              </div>
              <div className="absolute inset-0 overflow-y-auto">
                {isEditingLyrics ? (
                  <textarea
                    value={editableLyrics || ""}
                    onChange={(e) => setEditableLyrics(e.target.value)}
                    className="w-full h-full p-2 bg-gray-800 text-white font-mono resize-none"
                  />
                ) : (
                  <div className="text-white font-mono whitespace-pre-line pt-8">
                    {editableLyrics || "No lyrics available"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="w-full">
        <audio
          controls
          className={`w-full [&::-webkit-media-controls-panel]:bg-[#03FF24] [&::-webkit-media-controls-panel]:rounded-none [&::-webkit-media-controls-current-time-display]:text-black [&::-webkit-media-controls-time-remaining-display]:text-black [&::-webkit-media-controls-timeline]:bg-[#03FF24] [&::-webkit-media-controls-timeline]:rounded-none [&::-webkit-media-controls-play-button]:text-black [&::-webkit-media-controls-volume-slider]:bg-[#03FF24] [&::-webkit-media-controls-volume-slider]:rounded-none [&::-webkit-media-controls-mute-button]:text-black [&::-webkit-media-controls-enclosure]:bg-[#03FF24] [&::-webkit-media-controls]:text-black [&::-webkit-media-controls-timeline-container]:bg-[#03FF24] [&::-webkit-media-controls-enclosure]:rounded-none [&::-webkit-media-controls-panel]:rounded-none [&::-webkit-media-controls-volume-slider-container]:rounded-none [&::-webkit-media-controls-timeline-container]:rounded-none ${className}`}
          src={src}
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  );
}
