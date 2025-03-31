import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "@/utils/env";
import { toast } from "react-toastify";

const MAX_FILE_SIZE_MB = 5;

interface GenerateImageResponse {
  success: boolean;
  mediaUrl: string;
  remainingGenerations: number;
  resetTime: string;
}

interface FormImageInputProps {
  label: string;
  onChange: (file: File | null) => void;
  onPromptChange: (prompt: string) => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setGeneratingField: (value: string | null) => void;
  onPromptFunctionsChange: (
    setPrompt: (prompt: string) => void,
    onPromptChange: (prompt: string) => void,
  ) => void;
  onPreviewChange?: (previewUrl: string | null) => void;
}

export const FormImageInput = ({
  label,
  onChange,
  onPromptChange,
  onGenerate,
  isGenerating,
  setIsGenerating,
  setGeneratingField,
  onPromptFunctionsChange,
  onPreviewChange,
}: FormImageInputProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  );
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptDebounceRef = useRef<number | null>(null);

  // Debounced prompt change handler
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

  // Update lastGeneratedImage only when preview changes
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

  // Pass prompt functions to parent only once on mount
  useEffect(() => {
    onPromptFunctionsChange(setPrompt, onPromptChange);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error(
            `The uploaded image exceeds the ${MAX_FILE_SIZE_MB}MB limit.`,
          );
          return;
        }

        if (
          !["image/jpeg", "image/png", "image/gif", "video/mp4"].includes(
            file.type,
          )
        ) {
          toast.error("Only JPEG, PNG, GIF, and MP4 files are accepted");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setPreview(result);
          onChange(file);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
        onChange(null);
      }
    },
    [onChange],
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedPromptChange(value);
    },
    [debouncedPromptChange],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setLastPrompt(prompt);
    onGenerate(prompt);

    // Get auth token from localStorage
    const authToken = localStorage.getItem("authToken");

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    try {
      // Generate the image
      const response = await fetch(env.apiUrl + "/api/generate", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          prompt,
          type: "image",
        }),
      });

      if (!response.ok) throw new Error("Failed to generate image");

      const data = (await response.json()) as GenerateImageResponse;
      const imageUrl = data.mediaUrl;

      if (imageUrl) {
        // Convert image URL to File object
        const imageBlob = await fetch(imageUrl).then((r) => r.blob());
        const imageFile = new File([imageBlob], "generated-image.png", {
          type: "image/png",
        });

        // Set the preview
        setPreview(imageUrl);
        onChange(imageFile);
      }
    } catch (err) {
      console.error("Error generating image:", err);
      toast.error("Failed to generate image. Please try again.");
    } finally {
      // Make sure to reset the generating state
      setIsGenerating(false);
      setGeneratingField(null);
    }
  }, [prompt, onChange, setIsGenerating, setGeneratingField, isGenerating]);

  const handleReroll = useCallback(() => {
    setPreview(null);
    onChange(null);
    setPrompt(lastPrompt);
    onPromptChange(lastPrompt);
  }, [lastPrompt, onChange, onPromptChange]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setGeneratingField(null);
    setPreview(lastGeneratedImage);
    onChange(null);
  }, [lastGeneratedImage, onChange, setIsGenerating, setGeneratingField]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between">
        <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
          {label}
        </div>
      </div>

      {/* Image Preview Area - Now Square */}
      <div className="relative mt-1 aspect-square text-center border-[#8c8c8c] flex items-center justify-center">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#03FF24] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white">Generating your image...</p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-[#03FF24] px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : preview ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            <img
              src={preview}
              alt="Token preview"
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              onClick={handleReroll}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="flex flex-col gap-4 w-full h-full">
              <div className="flex-1 flex flex-col">
                <textarea
                  value={prompt}
                  onChange={handlePromptChange}
                  className="w-full h-full bg-[#0F0F0F] p-3 border border-neutral-800 text-white resize-none"
                  placeholder="Describe the image you want to generate..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="flex-1 bg-[#03FF24] text-black px-6 py-2.5 font-bold hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    "Generate Image"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="bg-[#03FF24] text-black px-6 py-2.5 font-bold hover:bg-[#27b938] transition-colors"
                >
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,video/mp4"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
