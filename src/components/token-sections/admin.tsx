import { FormInput } from "@/pages/create";
import { isFromDomain } from "@/utils";
import { env } from "@/utils/env";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import CopyButton from "../copy-button";
import { Icons } from "../icons";

type FormData = {
  links: {
    website: string;
    twitter: string;
    telegram: string;
    discord: string;
    farcaster: string;
  };
};

// Define the token data type to match the backend schema
interface TokenData {
  id: string;
  mint: string;
  name: string;
  creator: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  [key: string]: any; // For other properties that might exist
}

export default function AdminTab() {
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalData, setOriginalData] = useState<{
    website: string;
    twitter: string;
    telegram: string;
    discord: string;
    farcaster: string;
  }>({
    website: "",
    twitter: "",
    telegram: "",
    discord: "",
    farcaster: "",
  });

  // Extract token mint from URL if not found in params
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(
    null,
  );

  // Effect to detect token mint from various sources (similar to community tab)
  useEffect(() => {
    console.log("URL params mint:", urlTokenMint);

    // First try from URL params (most reliable)
    if (urlTokenMint) {
      console.log("Using token mint from URL params:", urlTokenMint);
      setDetectedTokenMint(urlTokenMint);
      return;
    }

    // If not in params, try to extract from pathname
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      console.log("Extracted token mint from pathname:", pathMatch[1]);
      setDetectedTokenMint(pathMatch[1]);
      return;
    }

    // If still not found, check if we might be in a token context from parent component
    console.log("Could not detect token mint from URL or path");
  }, [urlTokenMint, location.pathname]);

  const mint = detectedTokenMint;

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      links: {
        website: "",
        twitter: "",
        telegram: "",
        discord: "",
        farcaster: "",
      },
    },
  });

  // Watch for form changes
  const formValues = useWatch({
    control,
    name: "links",
  });

  // Check if form values have changed
  const hasChanges = () => {
    return (
      formValues?.website !== originalData.website ||
      formValues?.twitter !== originalData.twitter ||
      formValues?.telegram !== originalData.telegram ||
      formValues?.discord !== originalData.discord ||
      formValues?.farcaster !== originalData.farcaster
    );
  };

  // Fetch current token data
  useEffect(() => {
    if (!mint) return;

    const fetchTokenData = async () => {
      setIsLoading(true);
      try {
        console.log(`Fetching token data for mint: ${mint}`);
        const response = await fetch(`${env.apiUrl}/api/token/${mint}`);

        console.log("Token data response status:", response.status);

        if (!response.ok) {
          throw new Error(`Failed to fetch token data (${response.status})`);
        }

        const data = (await response.json()) as TokenData;
        console.log("Token data fetched:", data);

        // Store original values
        setOriginalData({
          website: data.website || "",
          twitter: data.twitter || "",
          telegram: data.telegram || "",
          discord: data.discord || "",
          farcaster: data.farcaster || "",
        });

        // Update form with existing values
        reset({
          links: {
            website: data.website || "",
            twitter: data.twitter || "",
            telegram: data.telegram || "",
            discord: data.discord || "",
            farcaster: data.farcaster || "",
          },
        });
      } catch (error) {
        console.error("Error fetching token data:", error);
        toast.error("Failed to load token data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTokenData();
  }, [mint, reset]);

  const onSubmit = async (data: FormData) => {
    if (!mint) {
      toast.error("No token ID found");
      return;
    }

    setIsSaving(true);

    try {
      // Get the auth token from localStorage
      const authToken = localStorage.getItem("authToken");

      // Create headers with auth token if available
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      console.log("Sending update request with headers:", headers);

      // Create request payload with development override if needed
      const payload: Record<string, any> = {
        website: data.links.website,
        twitter: data.links.twitter,
        telegram: data.links.telegram,
        discord: data.links.discord,
        farcaster: data.links.farcaster,
      };

      const response = await fetch(`${env.apiUrl}/api/token/${mint}/update`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        credentials: "include", // Important to include credentials for auth cookies
      });

      console.log("Update response status:", response.status);

      if (!response.ok) {
        let errorMessage = "Failed to update token";
        try {
          const errorData = (await response.json()) as { error?: string };
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error("Error parsing error response:", e);
        }
        throw new Error(errorMessage);
      }

      toast.success("Token information updated successfully");
    } catch (error) {
      console.error("Error updating token:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update token",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#03FF24]"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <div className="grid grid-cols-1">
        {/* Website Field */}
        <Controller
          control={control}
          name="links.website"
          render={({ field }) => (
            <FormInput
              type="text"
              {...field}
              isOptional
              inputTag={<Icons.Website />}
              placeholder="Website"
              rightIndicator={<CopyButton text={field.value || ""} />}
            />
          )}
        />

        {/* Twitter Field with custom domain validation for x.com */}
        <Controller
          control={control}
          name="links.twitter"
          rules={{
            validate: (value: string) =>
              !value || isFromDomain(value, "x.com") || "Invalid X URL",
          }}
          render={({ field, fieldState: { error } }) => (
            <div className="flex flex-col gap-1">
              <FormInput
                type="text"
                {...field}
                isOptional
                inputTag={<Icons.Twitter />}
                placeholder="X (Twitter)"
                rightIndicator={<CopyButton text={field.value || ""} />}
              />
              {error && (
                <span className="text-red-500 text-sm">{error.message}</span>
              )}
            </div>
          )}
        />

        {/* Telegram Field with custom domain validation for t.me */}
        <Controller
          control={control}
          name="links.telegram"
          rules={{
            validate: (value: string) =>
              !value || isFromDomain(value, "t.me") || "Invalid Telegram URL",
          }}
          render={({ field, fieldState: { error } }) => (
            <div className="flex flex-col gap-1">
              <FormInput
                type="text"
                {...field}
                isOptional
                inputTag={<Icons.Telegram />}
                placeholder="Telegram"
                rightIndicator={<CopyButton text={field.value || ""} />}
              />
              {error && (
                <span className="text-red-500 text-sm">{error.message}</span>
              )}
            </div>
          )}
        />

        {/* Discord Field with custom domain validation for discord.gg */}
        <Controller
          control={control}
          name="links.discord"
          rules={{
            validate: (value: string) =>
              !value ||
              isFromDomain(value, "discord.gg") ||
              "Invalid Discord URL",
          }}
          render={({ field, fieldState: { error } }) => (
            <div className="flex flex-col gap-1">
              <FormInput
                type="text"
                {...field}
                isOptional
                inputTag={<Icons.Discord />}
                placeholder="Discord"
                rightIndicator={<CopyButton text={field.value || ""} />}
              />
              {error && (
                <span className="text-red-500 text-sm">{error.message}</span>
              )}
            </div>
          )}
        />

        {/* Farcaster Field with custom domain validation */}
        <Controller
          control={control}
          name="links.farcaster"
          rules={{
            validate: (value: string) =>
              !value ||
              isFromDomain(value, "warpcast.com") ||
              "Invalid Farcaster URL",
          }}
          render={({ field, fieldState: { error } }) => (
            <div className="flex flex-col gap-1">
              <FormInput
                type="text"
                {...field}
                isOptional
                inputTag={
                  <img
                    src="/farcaster.svg"
                    alt="Farcaster"
                    className="w-5 h-5"
                  />
                }
                placeholder="Farcaster"
                rightIndicator={<CopyButton text={field.value || ""} />}
              />
              {error && (
                <span className="text-red-500 text-sm">{error.message}</span>
              )}
            </div>
          )}
        />
      </div>

      <button
        type="submit"
        disabled={isSaving || !hasChanges()}
        className={`ml-auto cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center ${
          isSaving || !hasChanges() ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isSaving ? "Updating..." : "Update"}
      </button>
    </form>
  );
}
