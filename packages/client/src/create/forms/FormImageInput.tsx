import { EmptyState } from "@/components/empty-state";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FormTab } from "../types";

export interface FormImageInputProps {
  onChange: (file: File | null) => void;
  onPromptChange: (prompt: string) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setGeneratingField: (value: string | null) => void;
  onPromptFunctionsChange: (
    setPrompt: (prompt: string) => void,
    onPromptChange: (prompt: string) => void,
  ) => void;
  onPreviewChange?: (previewUrl: string | null) => void;
  imageUrl?: string | null;
  onDirectPreviewSet?: (setter: (preview: string | null) => void) => void;
  activeTab: FormTab;
  nameValue?: string;
  onNameChange?: (value: string) => void;
  tickerValue?: string;
  onTickerChange?: (value: string) => void;
}
export const FormImageInput = ({
  onChange,
  onPromptChange,
  isGenerating,
  setIsGenerating,
  setGeneratingField,
  onPromptFunctionsChange,
  onPreviewChange,
  imageUrl,
  onDirectPreviewSet,
  activeTab,
  nameValue,
  onNameChange,
  tickerValue,
  onTickerChange,
}: FormImageInputProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  );
  const promptDebounceRef = useRef<number | null>(null);
  const hasDirectlySetPreview = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameInputFocused, setNameInputFocused] = useState(false);
  const [tickerInputFocused, setTickerInputFocused] = useState(false);

  useEffect(() => {
    if (onDirectPreviewSet) {
      onDirectPreviewSet((preview) => {
        hasDirectlySetPreview.current = true;
        setPreview(preview);
      });
    }
  }, [onDirectPreviewSet]);

  useEffect(() => {
    if (imageUrl && !preview && !hasDirectlySetPreview.current) {
      setPreview(imageUrl);
    }
  }, [imageUrl, preview]);

  const debouncedPromptChange = useCallback(
    (value: string) => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
      promptDebounceRef.current = window.setTimeout(() => {
        onPromptChange(value);
      }, 500);
    },
    [onPromptChange],
  );

  useEffect(() => {
    if (preview) {
      setLastGeneratedImage(preview);
      if (onPreviewChange) {
        onPreviewChange(preview);
      }
    } else if (onPreviewChange) {
      onPreviewChange(null);
    }
  }, [preview, onPreviewChange]);

  useEffect(() => {
    onPromptFunctionsChange(setPrompt, onPromptChange);
  }, []);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedPromptChange(value);
    },
    [debouncedPromptChange],
  );

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setGeneratingField(null);
    setPreview(lastGeneratedImage);
    onChange(null);
  }, [lastGeneratedImage, onChange, setIsGenerating, setGeneratingField]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];

        if (!file.type.startsWith("image/")) {
          toast.error("Please select an image file");
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          toast.error(
            "File is too large. Please select an image less than 5MB.",
          );
          return;
        }

        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        onChange(file);
      }
    },
    [onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (!file.type.startsWith("image/")) {
          toast.error("Please drop an image file");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error(
            "File is too large. Please select an image less than 5MB.",
          );
          return;
        }

        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);
        onChange(file);
      }
    },
    [onChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const triggerFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (activeTab === FormTab.MANUAL) {
      setPreview(null);
      onChange(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [activeTab, onChange]);

  useEffect(() => {
    return () => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
    };
  }, []);

  if (activeTab === FormTab.IMPORT && !preview && !imageUrl) {
    return null;
  }

  return (
    <div className="flex flex-col w-full">
      <div
        className="relative mt-1 aspect-square text-center flex items-center justify-center"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#03FF24] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white">Generating your image...</p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-[#03FF24] px-4 py-2 font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : preview || imageUrl ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            <img
              src={preview || imageUrl || ""}
              alt="Token preview"
              className="w-full h-full object-contain"
            />

            {activeTab === FormTab.MANUAL && (
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 text-white w-12 h-12 rounded-full flex items-center justify-center text-shadow opacity-50 hover:opacity-100 transition-all z-10"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black to-transparent opacity-60 z-[5]"></div>
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black to-transparent opacity-60 z-[5]"></div>
            {
              <div className="absolute top-4 left-4 z-10">
                {activeTab === FormTab.IMPORT && (
                  <span
                    className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5`}
                  >
                    {nameValue}
                  </span>
                )}
                {activeTab !== FormTab.IMPORT && (
                  <input
                    type="text"
                    value={nameValue || ""}
                    onChange={(e) =>
                      onNameChange && onNameChange(e.target.value)
                    }
                    placeholder="Token Name"
                    maxLength={128}
                    onFocus={() => setNameInputFocused(true)}
                    onBlur={() => setNameInputFocused(false)}
                    className={`bg-transparent text-white text-xl font-bold border-b-2 ${
                      nameInputFocused ? "border-white" : "border-gray-500"
                    } focus:outline-none px-1 py-0.5 w-[280px] max-w-[95%]`}
                  />
                )}
              </div>
            }
            {onTickerChange && (
              <div className="absolute bottom-4 left-4 z-10">
                <div className="flex items-center">
                  <span className="text-white text-opacity-80 mr-1">$</span>
                  {activeTab === FormTab.IMPORT && (
                    <span
                      className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5`}
                    >
                      {tickerValue}
                    </span>
                  )}
                  {activeTab !== FormTab.IMPORT && (
                    <input
                      type="text"
                      value={tickerValue || ""}
                      onChange={(e) => onTickerChange(e.target.value)}
                      placeholder="TICKER"
                      maxLength={16}
                      onFocus={() => setTickerInputFocused(true)}
                      onBlur={() => setTickerInputFocused(false)}
                      className={`bg-transparent text-white text-lg font-semibold border-b-2 ${
                        tickerInputFocused ? "border-white" : "border-gray-500"
                      } focus:outline-none px-1 py-0.5 max-w-[60%]`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            {activeTab === FormTab.MANUAL ? (
              <div
                className="flex flex-col items-center justify-center w-full h-full cursor-pointer bg-[url(/empty-state-bg.svg)] bg-cover"
                onClick={triggerFileInput}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="p-8 flex flex-col items-center justify-center w-4/5 h-4/5">
                  <EmptyState maxSizeMb={5} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full h-full">
                <div className="flex-1 flex flex-col">
                  <textarea
                    value={prompt}
                    onChange={handlePromptChange}
                    className="w-full h-full bg-[#0F0F0F] p-3 border border-neutral-800 text-white resize-none"
                    placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
