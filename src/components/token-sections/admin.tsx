import { FormInput } from "@/pages/create";
import { isFromDomain } from "@/utils";
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [detectedError, setDetectedError] = useState<string | null>(null);
  const { publicKey, connected } = useWallet();

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
      },
    },
  });

  // Debug information about wallet connection
  useEffect(() => {
    console.log("Wallet connection status:", connected);
    console.log("Wallet public key:", publicKey?.toString());

    // Try to get wallet address from localStorage as fallback
    const storedWalletAddress = localStorage.getItem("walletAddress");
    console.log("Stored wallet address:", storedWalletAddress);

    if (!connected && !publicKey) {
      setDetectedError(
        "No wallet connected. Please connect your wallet to manage token settings.",
      );
    } else {
      setDetectedError(null);
    }
  }, [connected, publicKey]);

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
        console.log("Token creator address:", data.creator);

        // Get wallet address from different sources
        const walletAddress = publicKey?.toString();
        console.log("Current wallet address:", walletAddress);

        // If we have the wallet and creator, check if they match
        if (walletAddress && data.creator) {
          try {
            // Normalize both addresses using PublicKey to ensure consistent format
            const normalizedWallet = new PublicKey(walletAddress).toString();
            const normalizedCreator = new PublicKey(data.creator).toString();

            console.log("Normalized wallet:", normalizedWallet);
            console.log("Normalized creator:", normalizedCreator);

            const isCreator = normalizedWallet === normalizedCreator;
            console.log("Is token creator (normalized check):", isCreator);

            // Fallback to case-insensitive string comparison if needed
            if (!isCreator) {
              const caseInsensitiveMatch =
                walletAddress.toLowerCase() === data.creator.toLowerCase();
              console.log(
                "Is token creator (case-insensitive check):",
                caseInsensitiveMatch,
              );

              if (caseInsensitiveMatch) {
                console.log("Match found with case-insensitive comparison");
              }

              setIsAdmin(caseInsensitiveMatch);
            } else {
              setIsAdmin(isCreator);
            }
          } catch (error) {
            console.error("Error comparing addresses:", error);
            // Fallback to simple comparison
            const simpleMatch = walletAddress === data.creator;
            console.log("Fallback simple comparison match:", simpleMatch);
            setIsAdmin(simpleMatch);
          }
        } else {
          console.log("Missing wallet or creator address for comparison");
          setIsAdmin(false);
        }

        // Update form with existing values
        reset({
          links: {
            website: data.website || "",
            twitter: data.twitter || "",
            telegram: data.telegram || "",
            discord: data.discord || "",
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
  }, [mint, reset, publicKey]);

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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
      <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
        Admin Panel
      </div>

      {detectedError && (
        <div className="bg-red-900/30 border border-red-500 p-3 mb-4">
          {detectedError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      <button
        type="submit"
        disabled={!isAdmin || isSaving}
        className={`cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center ${
          !isAdmin ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isSaving ? "Saving..." : "Save"}
      </button>

      {!isAdmin && (
        <p className="text-sm text-red-400 mt-2">
          You must be the token creator to edit these settings.
        </p>
      )}
    </form>
  );
}
