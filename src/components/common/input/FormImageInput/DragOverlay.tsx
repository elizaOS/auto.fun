import React from "react";

interface DragOverlayProps {
  isDragging: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-75">
      <p className="text-blue-500 font-semibold">Drop the image here</p>
    </div>
  );
};
