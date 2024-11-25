import React, { useRef, useState, useEffect } from "react";
import {
  FieldValues,
  UseControllerProps,
  useController,
} from "react-hook-form";
import { DragOverlay } from "./DragOverlay";
import { MediaPreview } from "./MediaPreview";
import { EmptyState } from "./EmptyState";

type InputPropsWithoutConflicts = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "defaultValue" | "name"
>;

interface ImageUploadInputProps<TFieldValues extends FieldValues = FieldValues>
  extends InputPropsWithoutConflicts,
    UseControllerProps<TFieldValues> {
  label?: string;
}

const ImageUploadInput = ({
  label,
  name,
  control,
  rules,
  defaultValue,
  ...props
}: ImageUploadInputProps) => {
  const {
    field: { ref, value, onChange, ...inputProps },
    fieldState: { error, isDirty },
  } = useController({
    name,
    control,
    rules,
    defaultValue,
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (value instanceof File) {
      const reader = new FileReader();
      reader.onload = () => {
        setMediaSrc(reader.result as string);
      };
      reader.readAsDataURL(value);
      setFile(value);
    } else {
      setMediaSrc(null);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [value]);

  const changeFile = (file: File | null) => {
    onChange(file);
    setFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    changeFile(file);
  };

  const handleDeleteImage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onChange(null);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0] || null;
    changeFile(file);
  };

  const handleContainerClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="mb-4">
      {label && (
        <label
          htmlFor={props.id}
          className="block mb-3 text-[#03ff24] font-medium"
        >
          {label}
        </label>
      )}
      <div
        className="relative border-2 border-dashed rounded-md p-4 cursor-pointer text-center border-[#03ff24]"
        onClick={handleContainerClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/jpeg, image/png, image/gif, video/mp4"
          {...props}
          {...inputProps}
          ref={(e) => {
            inputRef.current = e;
            ref(e);
          }}
          onChange={handleFileChange}
          className="hidden"
        />
        {/* Render the appropriate component based on the state */}
        {mediaSrc && file ? (
          <MediaPreview
            mediaSrc={mediaSrc}
            onDelete={handleDeleteImage}
            name={file.name}
            type={file.type}
          />
        ) : (
          <EmptyState />
        )}
        {/* Overlay for drag state */}
        <DragOverlay isDragging={isDragging} />
      </div>
      {isDirty && error && (
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
};

export default ImageUploadInput;
