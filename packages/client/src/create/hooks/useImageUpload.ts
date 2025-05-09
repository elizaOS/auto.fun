import { useCallback, useState } from "react";
import { uploadImage } from "../utils/uploadImage";
import { TokenMetadata } from "../types";

interface UseImageUploadProps {
  onImageUploaded?: (url: string) => void;
  onError?: (error: string) => void;
}

interface UploadResponse {
  imageUrl: string;
  metadataUrl: string;
}

export const useImageUpload = ({
  onImageUploaded,
  onError,
}: UseImageUploadProps = {}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const handleImageUpload = useCallback(
    async (file: File, tokenMetadata: TokenMetadata): Promise<UploadResponse> => {
      try {
        setIsUploading(true);
        setUploadProgress(0);

        if (!tokenMetadata.imageBase64) {
          throw new Error("Image data (base64) is required");
        }

        console.log('Uploading with metadata:', tokenMetadata);

        const result = await uploadImage(tokenMetadata);

        setUploadedImageUrl(result.imageUrl);
        if (onImageUploaded) {
          onImageUploaded(result.imageUrl);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to upload image";
        if (onError) {
          onError(errorMessage);
        }
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [onImageUploaded, onError],
  );

  const resetUpload = useCallback(() => {
    setUploadedImageUrl(null);
    setUploadProgress(0);
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadedImageUrl,
    handleImageUpload,
    resetUpload,
  };
};
