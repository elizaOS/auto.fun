import React, { useRef, useState, useEffect } from "react";
import {
  FieldValues,
  UseControllerProps,
  useController,
} from "react-hook-form";
import { DragOverlay } from "./DragOverlay";
import { MediaPreview } from "./MediaPreview";
import { EmptyState } from "./EmptyState";
import { RoundedButton } from "../../button/RoundedButton";

type InputPropsWithoutConflicts = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "defaultValue" | "name"
>;

interface ImageUploadInputProps<TFieldValues extends FieldValues = FieldValues>
  extends InputPropsWithoutConflicts,
    UseControllerProps<TFieldValues> {
  label?: string;
  maxSizeMb: number;
}

const ImageUploadInput = ({
  label,
  name,
  control,
  rules,
  defaultValue,
  maxSizeMb,
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
  const shouldShowError = isDirty && error;

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

    // manually trigger blur since our hidden input won't automatically do it
    // this helps trigger form validation
    inputProps.onBlur?.();
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
    <div>
      {label && (
        <label
          htmlFor={props.id}
          className="text-white uppercase leading-normal tracking-widest mb-3 block"
        >
          {label}
        </label>
      )}
      <div className={`${mediaSrc && file ? "flex items-start" : "block"}`}>
        <div
          className={`relative border-2 border-dashed rounded-md p-6 cursor-pointer text-center ${shouldShowError ? "border-[#ef5350]" : "border-[#8c8c8c]"}`}
          onClick={handleContainerClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/png, image/jpeg, image/gif, image/webp"
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
            <MediaPreview mediaSrc={mediaSrc} type={file.type} />
          ) : (
            <EmptyState maxSizeMb={maxSizeMb} />
          )}
          {/* Overlay for drag state */}
          <DragOverlay isDragging={isDragging} />
        </div>

        {mediaSrc && file && (
          <div className="flex flex-col gap-[14px]">
            <RoundedButton
              onClick={handleContainerClick}
              type="button"
              variant="filled"
              className="p-3 ml-3 bg-[#262626] text-white"
            >
              Change
            </RoundedButton>
            <RoundedButton
              type="button"
              onClick={handleDeleteImage}
              variant="filled"
              className="p-3 ml-3 bg-[#262626] text-white"
            >
              Delete
            </RoundedButton>
          </div>
        )}
      </div>

      {shouldShowError && (
        <p className="mt-2 text-sm text-[#ef5350]">{error.message}</p>
      )}
    </div>
  );
};

export default ImageUploadInput;
