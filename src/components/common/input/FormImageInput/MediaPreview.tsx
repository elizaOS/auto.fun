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
          <video width="88" height="88" autoPlay={false} controls={false}>
            <source src={mediaSrc} />
          </video>
        ) : (
          <img
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
