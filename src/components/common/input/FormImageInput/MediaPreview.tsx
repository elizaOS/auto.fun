import React from "react";
import { RoundedButton } from "../../button/RoundedButton";

interface MediaPreviewProps {
  mediaSrc: string;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  name: string;
  type: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  mediaSrc,
  onDelete,
  name,
  type,
}) => {
  return (
    <div className="flex items-end justify-between">
      <div className="flex gap-3">
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
            className="max-w-full h-auto rounded-[10px]"
          />
        )}
        <div>{name}</div>
      </div>
      <RoundedButton
        onClick={onDelete}
        color="red"
        variant="outlined"
        className="p-3"
      >
        Delete
      </RoundedButton>
    </div>
  );
};
