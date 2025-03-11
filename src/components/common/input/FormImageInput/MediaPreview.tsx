import React from "react";

interface MediaPreviewProps {
  mediaSrc: string;
  type: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  mediaSrc,
  type,
}) => {
  return (
    <div className="flex items-end justify-between">
      <div className="flex gap-3 max-w-full overflow-hidden  whitespace-nowrap">
        {type === "video/mp4" ? (
          <video
            width="200"
            height="200"
            autoPlay={true}
            controls={true}
            className="rounded-[10px]"
          >
            <source src={mediaSrc} />
          </video>
        ) : (
          <img
            width="200"
            height="200"
            src={mediaSrc}
            alt="Preview"
            className="rounded-[10px]"
          />
        )}
      </div>
    </div>
  );
};
