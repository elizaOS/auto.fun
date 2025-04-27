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
  // Validate the image URL is from our domain
  const isValidUrl = imageUrl.startsWith("https://storage.autofun.tech/");

  if (!isValidUrl) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded-lg">
        Invalid image URL
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
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
          <span>{new Date(timestamp).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};
