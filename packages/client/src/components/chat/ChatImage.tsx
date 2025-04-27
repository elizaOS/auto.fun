import React from "react";

interface ChatImageProps {
  imageUrl: string;
  caption?: string;
  author: string;
  timestamp: string;
}

export const ChatImage: React.FC<ChatImageProps> = ({
  imageUrl,
  caption,
  author,
  timestamp,
}) => {
  return (
    <div className="max-w-md mx-auto overflow-hidden">
      <div className="relative">
        <img
          src={imageUrl}
          alt={caption || "Chat image"}
          className="w-full h-auto object-cover"
          loading="lazy"
        />
        {caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2">
            {caption}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{author}</span>
          <span>{timestamp && new Date(timestamp)?.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};
