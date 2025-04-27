import React from "react";

interface ChatImageProps {
  imageUrl: string;
  caption?: string;
  author: string;
  timestamp: string;
}

export const ChatImage: React.FC<ChatImageProps> = ({ imageUrl, caption }) => {
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
    </div>
  );
};
