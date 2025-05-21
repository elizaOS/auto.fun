import { TokenMetadata, UploadResponse } from "@/create/types";
import { getAuthToken } from "@/utils/auth";
import { env } from "@/utils/env";

export const uploadImage = async (metadata: TokenMetadata) => {
  if (!metadata.imageBase64) {
    throw new Error("Image data (base64) is required");
  }

  // Determine a safe filename based on token metadata
  const safeName = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Get the image type from the data URL
  const contentType =
    metadata.imageBase64.match(/^data:([A-Za-z-+/]+);base64,/)?.[1] || "";

  let extension = ".jpg";
  if (contentType.includes("png")) extension = ".png";
  else if (contentType.includes("gif")) extension = ".gif";
  else if (contentType.includes("svg")) extension = ".svg";
  else if (contentType.includes("webp")) extension = ".webp";

  const filename = `${safeName}${extension}`;

  console.log(
    `Uploading image as ${filename} with content type ${contentType}`,
  );

  // Get auth token from localStorage with quote handling
  const authToken = getAuthToken();

  // Prepare headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  // Extract the base64 data without the data URL prefix
  const base64Data = metadata.imageBase64.split(",")[1];
  if (!base64Data) {
    throw new Error("Invalid base64 image data format");
  }

  console.log("Sending request with base64 data length:", base64Data.length);

  const response = await fetch(env.apiUrl + "/api/upload", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      image: metadata.imageBase64,
      metadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        twitter: metadata.links.twitter,
        telegram: metadata.links.telegram,
        website: metadata.links.website,
        discord: metadata.links.discord,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Authentication required. Please connect your wallet and try again.",
      );
    }
    const errorText = await response.text();
    console.error("Upload error response:", errorText);
    throw new Error("Failed to upload image: " + errorText);
  }

  const result = (await response.json()) as UploadResponse;

  if (!result.metadataUrl || result.metadataUrl === "undefined") {
    console.warn("No metadata URL returned from server, using fallback URL");
    result.metadataUrl = env.getMetadataUrl(
      metadata.tokenMint || crypto.randomUUID(),
    );
  }

  return result;
};
