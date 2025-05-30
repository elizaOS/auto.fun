import { FormInput } from "@/pages/create";
import { isFromDomain } from "@/utils";
import { fetcher } from "@/utils/api";
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import AudioPlayer from "../audio-player";
import CopyButton from "../copy-button";
import { Icons } from "../icons";
import Loader from "../loader";

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
  farcaster: string | null;
  hidden: boolean;
  featured: boolean;
  verified: boolean;
  [key: string]: any; // For other properties that might exist
}

// Use admin addresses from environment
const { adminAddresses } = env;

export default function AdminTab() {
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{
    hidden: boolean;
    featured: boolean;
    verified: boolean;
  }>({ hidden: false, featured: false, verified: false });
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
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null);
  const [audioTimestamp, setAudioTimestamp] = useState<number>(Date.now());
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Extract token mint from URL if not found in params
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(
    null,
  );

  // Effect to detect token mint from various sources (similar to community tab)
  useEffect(() => {
    // First try from URL params (most reliable)
    if (urlTokenMint) {
      setDetectedTokenMint(urlTokenMint);
      return;
    }

    // If not in params, try to extract from pathname
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      setDetectedTokenMint(pathMatch[1]);
      return;
    }
  }, [urlTokenMint, location.pathname]);

  const mint = detectedTokenMint;

  // Fetch generation settings when mint changes
  useEffect(() => {
    if (!mint) return;

    const fetchGenerationSettings = async () => {
      if (!mint) return;

      try {
        const response = await fetch(
          `${env.apiUrl}/api/generation/${mint}/settings`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch generation settings");
        }
        const data = await response.json();
        if (data.success && data.settings.audioContextUrl) {
          setExistingAudioUrl(data.settings.audioContextUrl);
        }
      } catch (error) {
        console.error("Error fetching generation settings:", error);
      }
    };

    fetchGenerationSettings();
  }, [mint]);

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
        const response = await fetch(`${env.apiUrl}/api/token/${mint}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch token data (${response.status})`);
        }

        const data = (await response.json()) as TokenData;
        // Store original values
        setOriginalData({
          website: data.website || "",
          twitter: data.twitter || "",
          telegram: data.telegram || "",
          discord: data.discord || "",
          farcaster: data.farcaster || "",
        });

        // Store token status
        setTokenStatus({
          hidden: data.hidden || false,
          featured: data.featured || false,
          verified: data.verified || false,
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

    // --- Link Normalization ---
    const normalizeUrl = (
      url: string,
      prefix: string,
      domain?: string,
    ): string => {
      if (!url) return "";
      try {
        url = url.trim();
        // If it's already a valid URL with the correct domain, ensure https
        if (url.startsWith("http://") || url.startsWith("https://")) {
          const urlObj = new URL(url);
          if (domain && urlObj.hostname.replace(/^www\\./, "") !== domain) {
            // Domain mismatch, try to extract path/username
            const path = urlObj.pathname.split("/").pop() || "";
            return path ? `${prefix}${path}` : ""; // Return empty if no path found
          }
          urlObj.protocol = "https:";
          return urlObj.toString();
        }
        // Handle cases like domain.com/path directly
        if (domain && url.startsWith(domain + "/")) {
          return `https://${url}`;
        }
        // Handle just username/path/code
        if (!url.includes("/") && !url.includes(".")) {
          return `${prefix}${url}`;
        }
        // If it doesn't seem like a username or valid url, prepend prefix cautiously
        // Assume it's a path/username if no protocol and no clear domain
        if (!url.startsWith("http") && !url.includes("://")) {
          // Basic check for common domain patterns - might need refinement
          const domainPattern = /^[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)+/;
          if (!domainPattern.test(url.split("/")[0])) {
            return `${prefix}${url}`;
          }
          // Otherwise, assume it's a full URL needing https
          return `https://${url}`;
        }
      } catch (e) {
        console.warn(`Could not parse or normalize URL: ${url}`, e);
        // Fallback: attempt basic https prefix if missing
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return `https://${url}`;
        }
      }
      // Return original url if normalization failed or wasn't applicable
      return url;
    };

    const normalizeTwitter = (input: string): string => {
      if (!input) return "";
      input = input.trim();
      const twitterUrlMatch = input.match(
        /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/,
      );
      if (twitterUrlMatch && twitterUrlMatch[1]) {
        return `https://x.com/${twitterUrlMatch[1]}`;
      }
      // Assume it's just the username if no URL match
      const usernameMatch = input.match(/^[a-zA-Z0-9_]+$/);
      if (usernameMatch) {
        return `https://x.com/${input}`;
      }
      console.warn(`Could not normalize Twitter/X input: ${input}`);
      return input; // Return original if cannot parse
    };

    const normalizedLinks = {
      website: normalizeUrl(data.links.website || "", "https://"),
      twitter: normalizeTwitter(data.links.twitter || ""),
      telegram: normalizeUrl(
        data.links.telegram || "",
        "https://t.me/",
        "t.me",
      ),
      discord: normalizeUrl(
        data.links.discord || "",
        "https://discord.gg/",
        "discord.gg",
      ),
      farcaster: normalizeUrl(
        data.links.farcaster || "",
        "https://warpcast.com/",
        "warpcast.com",
      ),
    };
    // --- End Link Normalization ---

    try {
      const authToken = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${JSON.parse(authToken)}`;
      }

      // Create request payload with development override if needed
      // Use normalized links
      const payload: Record<string, any> = {
        website: normalizedLinks.website,
        twitter: normalizedLinks.twitter,
        telegram: normalizedLinks.telegram,
        discord: normalizedLinks.discord,
        farcaster: normalizedLinks.farcaster,
      };

      // Try admin endpoint first, fall back to owner endpoint if not admin
      let response = await fetch(
        `${env.apiUrl}/api/admin/tokens/${mint}/social`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        },
      );

      if (response.status === 403) {
        // If not admin, try owner endpoint
        response = await fetch(
          `${env.apiUrl}/api/owner/tokens/${mint}/social`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            credentials: "include",
          },
        );
      }

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
      setOriginalData({
        website: normalizedLinks.website || "",
        twitter: normalizedLinks.twitter || "",
        telegram: normalizedLinks.telegram || "",
        discord: normalizedLinks.discord || "",
        farcaster: normalizedLinks.farcaster || "",
      });
      queryClient.invalidateQueries({ queryKey: ["token", mint] });
    } catch (error) {
      console.error("Error updating token:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update token",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Mutations for Moderator Actions ---

  // Mutation for toggling hidden status
  const toggleHiddenMutation = useMutation({
    mutationFn: async () => {
      if (!mint) throw new Error("Mint address not found");
      return await fetcher(`/api/admin/tokens/${mint}/hidden`, "POST", {
        hidden: !tokenStatus.hidden,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenStatus.hidden ? "unhidden" : "hidden"} successfully`,
      );
      // Manually update state for immediate UI feedback
      setTokenStatus((prev) => ({ ...prev, hidden: !prev.hidden }));
      queryClient.invalidateQueries({ queryKey: ["token", mint] }); // Refetch token data in the background
    },
    onError: (error) => {
      toast.error(
        `Failed to update hidden status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Mutation for toggling featured status
  const toggleFeaturedMutation = useMutation({
    mutationFn: async () => {
      if (!mint) throw new Error("Mint address not found");
      return await fetcher(`/api/admin/tokens/${mint}/featured`, "POST", {
        featured: !tokenStatus.featured,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenStatus.featured ? "removed from" : "added to"} featured tokens`,
      );
      // Manually update state for immediate UI feedback
      setTokenStatus((prev) => ({ ...prev, featured: !prev.featured }));
      queryClient.invalidateQueries({ queryKey: ["token", mint] }); // Refetch token data in the background
    },
    onError: (error) => {
      toast.error(
        `Failed to update featured status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Mutation for toggling verified status
  const toggleVerifiedMutation = useMutation({
    mutationFn: async () => {
      if (!mint) throw new Error("Mint address not found");
      return await fetcher(`/api/admin/tokens/${mint}/verified`, "POST", {
        verified: !tokenStatus.verified,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenStatus.verified ? "unverified" : "verified"} successfully`,
      );
      // Manually update state for immediate UI feedback
      setTokenStatus((prev) => ({ ...prev, verified: !prev.verified }));
      queryClient.invalidateQueries({ queryKey: ["token", mint] }); // Refetch token data in the background
    },
    onError: (error) => {
      toast.error(
        `Failed to update verified status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // --- End Mutations ---

  // ---- Moderator Check using hardcoded list ----
  const { publicKey } = useWallet();
  const isModerator = publicKey
    ? adminAddresses.includes(publicKey.toString())
    : false;

  // Check if user is the token owner
  const [isTokenOwner, setIsTokenOwner] = useState(false);

  // Update the ownership check in useEffect
  useEffect(() => {
    if (!mint) return;
    const fetchTokenData = async () => {
      try {
        const response = await fetch(`${env.apiUrl}/api/token/${mint}`);
        const data = (await response.json()) as { creator: string };
        setIsTokenOwner(data.creator === publicKey?.toString());
        // ... rest of the fetch logic
      } catch (error) {
        console.error("Error fetching token data:", error);
      }
    };
    fetchTokenData();
  }, [mint, publicKey]);

  const queryClient = useQueryClient();

  // Add these new functions for audio handling
  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("audio/")) {
      toast.error("Please select an audio file");
      return;
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(
        "File is too large. Please select an audio file less than 10MB.",
      );
      return;
    }

    setSelectedAudioFile(file);
  };

  const handleAudioUpload = async () => {
    if (!mint || !selectedAudioFile) return;

    setIsUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("audio", selectedAudioFile);

      const authToken = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        Authorization: `Bearer ${JSON.parse(authToken || "{}")}`,
      };

      const response = await fetch(
        `${env.apiUrl}/api/token/${mint}/audio-context`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to upload audio context");
      }

      toast.success("Audio context uploaded successfully");
      setSelectedAudioFile(null);
      setAudioTimestamp(Date.now());
      if (audioInputRef.current) {
        audioInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error uploading audio:", error);
      toast.error("Failed to upload audio context");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  // If not a moderator or owner, don't render the admin controls
  if (!isModerator && !isTokenOwner) {
    return (
      <div className="p-4 text-center text-autofun-text-secondary">
        Admin controls are only available to moderators and the token creator.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
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

        {/* Twitter Field */}
        <Controller
          control={control}
          name="links.twitter"
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

        {/* Telegram Field */}
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

        {/* Discord Field */}
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

        {/* Farcaster Field */}
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
                inputTag={<Icons.Farcaster />}
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

      {/* Update Social Links Button */}
      <button
        type="submit"
        disabled={isSaving || !hasChanges()}
        className={`ml-auto cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center ${
          isSaving || !hasChanges() ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isSaving ? "Saving..." : "Save Social Links"}
      </button>

      {/* Moderator Actions Section - Only show for moderators */}
      {isModerator && (
        <div className="mt-6 pt-4 border-t border-autofun-border">
          <h4 className="text-md font-semibold mb-3 text-autofun-text-secondary">
            Moderator Actions
          </h4>
          <div className="flex flex-wrap justify-start gap-2">
            <button
              type="button"
              className={`px-4 py-2 text-sm ${
                tokenStatus.featured
                  ? "bg-red-700 text-red-100 hover:bg-red-600"
                  : "bg-blue-700 text-blue-100 hover:bg-blue-600"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => toggleFeaturedMutation.mutate()}
              disabled={toggleFeaturedMutation.isPending}
            >
              {toggleFeaturedMutation.isPending
                ? "Processing..."
                : tokenStatus.featured
                  ? "Remove Featured"
                  : "Make Featured"}
            </button>

            <button
              type="button"
              className={`px-4 py-2 text-sm ${
                tokenStatus.verified
                  ? "bg-red-700 text-red-100 hover:bg-red-600"
                  : "bg-green-700 text-green-100 hover:bg-green-600"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => toggleVerifiedMutation.mutate()}
              disabled={toggleVerifiedMutation.isPending}
            >
              {toggleVerifiedMutation.isPending
                ? "Processing..."
                : tokenStatus.verified
                  ? "Remove Verified"
                  : "Make Verified"}
            </button>

            <button
              type="button"
              className={`px-4 py-2 text-sm ${
                tokenStatus.hidden
                  ? "bg-yellow-700 text-yellow-100 hover:bg-yellow-600"
                  : "bg-gray-700 text-gray-100 hover:bg-gray-600"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => toggleHiddenMutation.mutate()}
              disabled={toggleHiddenMutation.isPending}
            >
              {toggleHiddenMutation.isPending
                ? "Processing..."
                : tokenStatus.hidden
                  ? "Unhide Token"
                  : "Hide Token"}
            </button>
          </div>
          <div className="flex justify-start mt-4">
            <Link
              to={`/admin/tokens/${mint}`}
              className="text-sm px-3 py-1 bg-autofun-background-action-primary hover:bg-autofun-background-action-highlight text-autofun-text-primary"
            >
              Go to Full Admin View
            </Link>
          </div>
        </div>
      )}

      {/* Audio Context Section - Only show for token owner */}
      {isTokenOwner && (
        <div className="mt-6 pt-4 border-t border-autofun-border">
          <h4 className="text-md font-semibold mb-3 text-autofun-text-secondary">
            Audio Context
          </h4>
          <div className="flex flex-col gap-4 max-w-2xl">
            <p className="text-sm text-autofun-text-secondary">
              Upload an audio file to use as context for music generation. This
              will be used instead of the default audio context.
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioSelect}
                ref={audioInputRef}
                className="file:border file:border-[#03FF24] file:mr-4 file:py-2 file:px-4 file:border-solid file:text-sm file:bg-transparent file:text-[#03FF24] file:cursor-pointer file:hover:bg-[#03FF24]/10 text-[#03FF24]"
              />
              {selectedAudioFile && (
                <span className="text-sm text-autofun-text-secondary">
                  {selectedAudioFile.name}
                </span>
              )}
              {existingAudioUrl && !selectedAudioFile && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 mb-4">
                    <AudioPlayer
                      src={`${existingAudioUrl}?t=${audioTimestamp}`}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <div className="flex relative w-full">
                      <div className="bg-autofun-background-input flex justify-between py-2 pl-1 pr-3 min-w-0 w-full relative">
                        <span className="mx-auto w-0 flex-1 min-w-0 block text-sm text-autofun-text-secondary truncate pr-6 pl-1">
                          {existingAudioUrl.replace(/^https?:\/\//, "")}
                        </span>
                      </div>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-autofun-background-input">
                        <CopyButton text={existingAudioUrl} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="text-sm text-[#03FF24] hover:text-[#03FF24]/80 transition-colors ml-2"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              )}
              {selectedAudioFile && (
                <button
                  type="button"
                  onClick={handleAudioUpload}
                  disabled={isUploadingAudio}
                  className="px-4 py-2 text-sm bg-[#03FF24] text-black hover:bg-[#03FF24]/80 transition-colors disabled:opacity-50 w-fit"
                >
                  {isUploadingAudio ? "Uploading..." : "Upload"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
