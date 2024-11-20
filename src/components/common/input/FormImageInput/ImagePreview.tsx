import React from "react";
import { RoundedButton } from "../../button/RoundedButton";

interface ImagePreviewProps {
  imageSrc: string;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  name: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  imageSrc,
  onDelete,
  name,
}) => (
  <div className="flex items-end justify-between">
    <div className="flex gap-3">
      <img
        src={imageSrc}
        alt="Preview"
        className="max-w-full h-auto rounded-[10px]"
      />
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
