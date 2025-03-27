import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair } from "@solana/web3.js";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import CopyButton from "../components/copy-button";
import { Icons } from "../components/icons";
import { TokenMetadata } from "../types/form.type";
import { EmptyState } from "@/components/empty-state";
import { DiceButton } from "../components/dice-button";
import { useWalletModal } from "../hooks/use-wallet-modal";
import Button from "../components/button";
import CoinDrop from "../components/coindrop";

// Constants
const MAX_FILE_SIZE_MB = 5;
const MAX_INITIAL_SOL = 45;

// Wallet Connection Banner
const WalletConnectionBanner = () => {
  const { setVisible } = useWalletModal();
  
  return (
    <div className="bg-autofun-background-action-highlight text-autofun-background-primary w-full mb-6 py-4 px-6 flex justify-between items-center">
      <div className="font-dm-mono font-medium">
        Connect your wallet to create a token
      </div>
      <Button 
        onClick={() => setVisible(true)} 
        size="small"
        className="bg-autofun-background-primary text-autofun-background-action-highlight hover:bg-autofun-background-action-primary hover:text-autofun-background-primary"
      >
        Connect Wallet
      </Button>
    </div>
  );
};

interface UploadResponse {
  success: boolean;
  imageUrl: string;
  metadataUrl: string;
}

interface GenerateMetadataResponse {
  success: boolean;
  metadata: {
    name?: string;
    symbol?: string;
    description?: string;
    creative?: string;
  };
}

interface GenerateImageResponse {
  success: boolean;
  mediaUrl: string;
  remainingGenerations: number;
  resetTime: string;
}

// Form Components
const FormInput = ({
  label,
  isOptional,
  error,
  leftIndicator,
  rightIndicator,
  inputTag,
  ...props
}: {
  label?: string;
  isOptional?: boolean;
  error?: string;
  leftIndicator?: React.ReactNode;
  rightIndicator?: React.ReactNode;
  inputTag?: React.ReactNode;
  [key: string]: any;
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <FormLabel label={label} isOptional={isOptional} />}
      <div className="relative flex items-center">
        {inputTag && (
          <div className="bg-[#262626] flex items-center h-full px-3">
            {inputTag}
          </div>
        )}
        {leftIndicator && (
          <div className="absolute left-3 text-[#8c8c8c]">{leftIndicator}</div>
        )}
        <input
          className={`w-full bg-[#0F0F0F] py-2.5 px-3 border border-neutral-800 text-white ${
            inputTag ? "pl-2" : ""
          } ${leftIndicator ? "pl-10" : ""}`}
          {...props}
        />
        {rightIndicator && (
          <div className="absolute right-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
};

const FormLabel = ({
  label,
  isOptional,
}: {
  label: string;
  isOptional?: boolean;
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
        {label}
      </div>
      {isOptional && (
        <div className="text-[#8c8c8c] text-[16px]">(Optional)</div>
      )}
    </div>
  );
};

FormInput.Label = FormLabel;

const FormTextArea = ({
  label,
  rightIndicator,
  minRows = 3,
  maxLength,
  ...props
}: {
  label?: string;
  rightIndicator?: React.ReactNode;
  minRows?: number;
  maxLength?: number;
  [key: string]: any;
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <FormLabel label={label} />}
      <div className="relative">
        <textarea
          className="w-full bg-[#0F0F0F] h-[250px] p-3 border border-neutral-800 text-white resize-none"
          style={{ minHeight: `${minRows * 1.5}rem` }}
          maxLength={maxLength}
          {...props}
        />
        {rightIndicator && (
          <div className="absolute right-3 bottom-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
    </div>
  );
};

const FormImageInput = ({
  label,
  onChange,
}: {
  label: string;
  onChange: (file: File | null) => void;
}) => {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        alert(`The uploaded image exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
        return;
      }

      if (
        !["image/jpeg", "image/png", "image/gif", "video/mp4"].includes(
          file.type
        )
      ) {
        alert("Only JPEG, PNG, GIF, and MP4 files are accepted");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onChange(file);
    } else {
      setPreview(null);
      onChange(null);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <FormLabel label={label} />
      <div className="relative justify-center border-1 border-dashed p-6 cursor-pointer text-center border-[#8c8c8c]">
        {preview ? (
          <div className="flex justify-center">
            <img
              src={preview}
              alt="Token preview"
              className="max-h-40 object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 cursor-pointer text-center">
            <EmptyState maxSizeMb={MAX_FILE_SIZE_MB} />
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,video/mp4"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

// Image upload function
const uploadImage = async (metadata: TokenMetadata) => {
  // Determine a safe filename based on token metadata
  const safeName = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Get the image type from the data URL
  const contentType =
    metadata.imageBase64?.match(/^data:([A-Za-z-+/]+);base64,/)?.[1] || "";

  // Determine file extension from content type
  let extension = ".jpg"; // Default
  if (contentType.includes("png")) extension = ".png";
  else if (contentType.includes("gif")) extension = ".gif";
  else if (contentType.includes("svg")) extension = ".svg";
  else if (contentType.includes("webp")) extension = ".webp";

  const filename = `${safeName}${extension}`;

  console.log(
    `Uploading image as ${filename} with content type ${contentType}`
  );

  // Get auth token from localStorage
  const authToken = localStorage.getItem("authToken");

  // Prepare headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(import.meta.env.VITE_API_URL + "/api/upload", {
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
        agentLink: metadata.links.agentLink,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to upload image");
  }

  return (await response.json()) as UploadResponse;
};

// Function to wait for token creation
const waitForTokenCreation = async ({
  mint,
  name,
  symbol,
  description,
  twitter,
  telegram,
  website,
  discord,
  agentLink,
  imageUrl,
  metadataUrl,
  timeout = 80_000,
}: {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  agentLink: string;
  imageUrl: string;
  metadataUrl: string;
  timeout?: number;
}) => {
  return new Promise<void>(async (resolve, reject) => {
    let resolved = false;

    // Set a timeout to reject if we don't get a response
    const timerId = setTimeout(() => {
      if (!resolved) {
        reject(new Error("Token creation timed out"));
      }
    }, timeout);

    try {
      // Wait a few seconds for the transaction to be confirmed
      await new Promise((r) => setTimeout(r, 4000));

      // Try direct token creation
      try {
        console.log(`Creating token record for ${mint}`);

        // Get auth token from localStorage
        const authToken = localStorage.getItem("authToken");

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const createResponse = await fetch(
          import.meta.env.VITE_API_URL + "/api/create-token",
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              tokenMint: mint,
              mint,
              name,
              symbol,
              description,
              twitter,
              telegram,
              website,
              discord,
              agentLink,
              imageUrl,
              metadataUrl,
            }),
          }
        );

        if (createResponse.ok) {
          const data = await createResponse.json();
          if (
            data &&
            typeof data === "object" &&
            "success" in data &&
            data.success === true
          ) {
            console.log(`Token ${mint} created via direct API call`);
            clearTimeout(timerId);
            resolved = true;
            resolve();
            return;
          }
        }
      } catch (createError) {
        console.error("Error creating token:", createError);
      }

      // If direct creation fails, try the check endpoint
      for (let i = 0; i < 3; i++) {
        if (resolved) break;

        console.log(`Checking for token ${mint}, attempt ${i + 1}`);
        try {
          // Get auth token from localStorage
          const authToken = localStorage.getItem("authToken");

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          const response = await fetch(
            import.meta.env.VITE_API_URL + "/api/check-token",
            {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({
                tokenMint: mint,
                imageUrl,
                metadataUrl,
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (
              data &&
              typeof data === "object" &&
              "tokenFound" in data &&
              data.tokenFound === true
            ) {
              console.log(`Token ${mint} found via check API`);
              clearTimeout(timerId);
              resolved = true;
              resolve();
              break;
            }
          }
        } catch (checkError) {
          console.error(`Error checking token (attempt ${i + 1}):`, checkError);
        }

        // Wait before trying again
        await new Promise((r) => setTimeout(r, 3000));
      }

      // If we got here and haven't resolved, reject
      if (!resolved) {
        clearTimeout(timerId);
        reject(new Error("Failed to confirm token creation"));
      }
    } catch (error) {
      console.error("Error in token creation process:", error);
      clearTimeout(timerId);
      reject(error);
    }
  });
};

// Main Form Component
export const Create = () => {
  const navigate = useNavigate();
  const { publicKey, signTransaction } = useWallet();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const { setVisible } = useWalletModal();
  // Add state to control when to show the coin drop effect
  const [showCoinDrop, setShowCoinDrop] = useState(false);

  // Simple form state
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    creative: "",
    initial_sol: "",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: ""
    },
  });

  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    creative: "",
    initial_sol: "",
  });

  // Add keyboard event listener for spacebar to trigger coin drop for debugging
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        setShowCoinDrop(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Handle input changes
  const handleChange = (field: string, value: string) => {
    // Handle nested fields (for links)
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      setForm((prev) => {
        if (parent === "links") {
          return {
            ...prev,
            links: {
              ...prev.links,
              [child]: value,
            },
          };
        }
        return prev;
      });
    } else {
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    }

    // Clear errors immediately when field has a value
    if (field === "name" || field === "symbol" || field === "description") {
      if (value) {
        setErrors((prev) => ({
          ...prev,
          [field]: "",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [field]: `${field.charAt(0).toUpperCase() + field.slice(1)} is required`,
        }));
      }
    }

    // Validate initial_sol
    if (field === "initial_sol" && value) {
      const numValue = parseFloat(value);
      if (numValue < 0 || numValue > MAX_INITIAL_SOL) {
        setErrors((prev) => ({
          ...prev,
          initial_sol: `Max initial SOL is ${MAX_INITIAL_SOL}`,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          initial_sol: "",
        }));
      }
    }
  };

  // Create token on-chain
  const createTokenOnChain = async (
    _tokenMetadata: TokenMetadata,
    mintKeypair: Keypair,
    _metadataUrl: string
  ) => {
    if (!signTransaction) {
      throw new Error("Wallet doesn't support signing");
    }

    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    // Create connection to Solana
    new Connection(
      import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    // For now, we'll bypass actual on-chain token creation since we need the program IDL
    // Instead, we'll just log the mint address and proceed with backend registration
    console.log(
      "Would create token with mint address:",
      mintKeypair.publicKey.toString()
    );

    try {
      // This will bypass the actual on-chain transaction for now
      // In a real implementation, you would integrate with your Solana program

      // Return a placeholder transaction ID
      const placeholderTxId =
        "simulated_" + Math.random().toString(36).substring(2, 15);
      console.log("Simulated transaction ID:", placeholderTxId);
      return placeholderTxId;
    } catch (error) {
      console.error("Error in simulated token creation:", error);
      throw error;
    }

    /* Implementation with actual program integration would go here
    For example:
    
    try {
      // Find program ID - this should be provided from your environment or config
      const programId = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
      
      // Create the transaction, add instructions, sign and submit
      // ...
      
      return txId;
    } catch (error) {
      console.error("Error creating token on-chain:", error);
      throw error;
    }
    */
  };

  // Function to generate metadata
  const generateMetadata = async (fields: string[]) => {
    try {
      // Check if wallet is connected first
      if (!publicKey) {
        setVisible(true);
        throw new Error("Please connect your wallet to generate metadata");
      }

      setIsGenerating(true);
      setGeneratingField(fields.join(","));

      // Get auth token from localStorage
      const authToken = localStorage.getItem("authToken");

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      // Call the generate-metadata endpoint
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/api/generate-metadata",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            fields,
            existingData: {
              name: form.name,
              symbol: form.symbol,
              description: form.description,
              creative: form.creative,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate metadata");
      }

      const data = (await response.json()) as GenerateMetadataResponse;
      const { metadata } = data;

      // Update form with generated data
      setForm((prev) => ({
        ...prev,
        ...metadata,
      }));

      // If we generated a creative prompt, also generate an image
      if (metadata.creative) {
        // Generate image using the creative prompt
        const imageResponse = await fetch(
          import.meta.env.VITE_API_URL + "/api/generate",
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              prompt: metadata.creative,
              type: "image",
            }),
          }
        );

        if (!imageResponse.ok) {
          throw new Error("Failed to generate image");
        }

        const imageData = (await imageResponse.json()) as GenerateImageResponse;
        const imageUrl = imageData.mediaUrl;

        // Convert image URL to File object
        const imageBlob = await fetch(imageUrl).then((r) => r.blob());
        const imageFile = new File([imageBlob], "generated-image.png", {
          type: "image/png",
        });
        setImageFile(imageFile);
      }
    } catch (error) {
      console.error("Error generating metadata:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to generate metadata. Please try again."
      );
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  // Function to generate all fields
  const generateAll = async () => {
    await generateMetadata(["name", "symbol", "description", "creative"]);
  };

  // Submit form to backend
  const submitFormToBackend = async () => {
    try {
      setIsSubmitting(true);
      
      // Trigger coin drop effect
      setShowCoinDrop(true);

      // Ensure wallet is connected
      if (!publicKey) {
        setVisible(true);
        throw new Error("Please connect your wallet to create a token");
      }

      // Generate a new keypair for the token mint
      const mintKeypair = Keypair.generate();
      const tokenMint = mintKeypair.publicKey.toBase58();

      // Convert image to base64 if exists
      let media_base64: string | null = null;
      if (imageFile) {
        media_base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(imageFile);
        });
      }

      // Create token metadata
      const tokenMetadata: TokenMetadata = {
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        initialSol: parseFloat(form.initial_sol) || 0,
        links: {
          ...form.links,
          agentLink: "", // Add empty agentLink
        },
        imageBase64: media_base64,
        tokenMint,
        decimals: 9,
        supply: 1000000000000000,
        freezeAuthority: publicKey?.toBase58() || "",
        mintAuthority: publicKey?.toBase58() || "",
      };

      // First, upload the image to get permanent URLs
      let imageUrl = "";
      let metadataUrl = "";

      if (media_base64) {
        try {
          console.log("Uploading image...");
          const uploadResult = await uploadImage(tokenMetadata);
          imageUrl = uploadResult.imageUrl;
          metadataUrl = uploadResult.metadataUrl;
          console.log("Image uploaded successfully:", imageUrl);
          console.log("Metadata URL:", metadataUrl);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          throw new Error("Failed to upload token image");
        }
      }

      // Create token on-chain
      try {
        console.log("Creating token on-chain...");
        await createTokenOnChain(tokenMetadata, mintKeypair, metadataUrl);
        console.log("Token created on-chain successfully");
      } catch (onChainError) {
        console.error("Error creating token on-chain:", onChainError);
        throw new Error("Failed to create token on-chain");
      }

      // Wait for token creation to be confirmed
      try {
        console.log("Waiting for token creation confirmation...");
        await waitForTokenCreation({
          mint: tokenMint,
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          twitter: form.links.twitter,
          telegram: form.links.telegram,
          website: form.links.website,
          discord: form.links.discord,
          agentLink: "", // Add empty agentLink
          imageUrl,
          metadataUrl,
        });
        console.log("Token creation confirmed");
      } catch (waitError) {
        console.error("Error waiting for token creation:", waitError);
        // We still continue to the token page even if this fails
        console.warn("Continuing despite token creation confirmation failure");
      }

      // Let the coin drop animation play for a bit before redirecting
      setTimeout(() => {
        // Redirect to token page using the mint public key
        navigate(`/token/${tokenMint}`);
      }, 3000);
    } catch (error) {
      console.error("Error creating token:", error);
      // Hide coin drop on error
      setShowCoinDrop(false);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create token. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if wallet is connected first
    if (!publicKey) {
      setVisible(true);
      alert("Please connect your wallet to create a token");
      return;
    }

    // Validate required fields
    const newErrors = { ...errors };
    if (!form.name) newErrors.name = "Name is required";
    if (!form.symbol) newErrors.symbol = "Symbol is required";
    if (!form.description) newErrors.description = "Description is required";

    // Check if there are any errors
    if (
      newErrors.name ||
      newErrors.symbol ||
      newErrors.description ||
      newErrors.initial_sol
    ) {
      setErrors(newErrors);
      return;
    }

    // Submit form to backend
    await submitFormToBackend();
  };

  // Check if form is valid
  const isFormValid =
    !!form.name &&
    !!form.symbol &&
    !!form.description &&
    !errors.name &&
    !errors.symbol &&
    !errors.description &&
    !errors.initial_sol;

  return (
    <div className="flex flex-col items-center py-10 md:py-0 justify-center min-h-screen max-w-[800px] mx-auto">
      {showCoinDrop && <CoinDrop />}
      
      {!publicKey && <WalletConnectionBanner />}
      <div className="flex flex-col gap-y-4">
          <div className="text-autofun-background-action-highlight font-medium text-[32px]">
            Create Token
          </div>
          <div className="text-[18px] font-normal text-autofun-text-secondary">
            Create your token on auto.fun. Set up your token details, add
            visuals, and connect social channels. You can optionally create or
            link an existing AI agent to your token. You can also personally
            allocate a portion of tokens before launch.
          </div>
        </div>
      <div className="p-4 bg-autofun-background-card max-w-[800px]">
        <form
          className="flex font-dm-mono flex-col w-full max-w-3xl m-auto gap-4 justify-center"
          onSubmit={handleSubmit}
        >
          <div className="flex justify-end">
            <DiceButton
              onClick={generateAll}
              isLoading={
                isGenerating &&
                generatingField === "name,symbol,description,creative"
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="relative">
              <FormInput
                type="text"
                value={form.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("name", e.target.value)
                }
                label="Name"
                maxLength={50}
                rightIndicator={`${form.name.length}/50`}
                error={errors.name}
              />
              <div className="absolute right-3 top-8">
                <DiceButton
                  onClick={() => generateMetadata(["name"])}
                  isLoading={isGenerating && generatingField === "name"}
                />
              </div>
            </div>

            <div className="relative">
              <FormInput
                type="text"
                value={form.symbol}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("symbol", e.target.value)
                }
                label="Ticker"
                leftIndicator="$"
                maxLength={8}
                rightIndicator={`${form.symbol.length}/8`}
                error={errors.symbol}
              />
              <div className="absolute right-3 top-8">
                <DiceButton
                  onClick={() => generateMetadata(["symbol"])}
                  isLoading={isGenerating && generatingField === "symbol"}
                />
              </div>
            </div>
          </div>

          <div className="relative">
            <FormTextArea
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleChange("description", e.target.value)
              }
              label="Description"
              rightIndicator={`${form.description.length}/2000`}
              minRows={5}
              maxLength={2000}
              error={errors.description}
            />
            <div className="absolute right-3 top-8">
              <DiceButton
                onClick={() => generateMetadata(["description"])}
                isLoading={isGenerating && generatingField === "description"}
              />
            </div>
          </div>

          <div className="relative">
            <FormTextArea
              value={form.creative}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleChange("creative", e.target.value)
              }
              label="Generation Prompt"
              rightIndicator={`${form.creative.length}/2000`}
              minRows={5}
              maxLength={2000}
              error={errors.creative}
            />
            <div className="absolute right-3 top-8">
              <DiceButton
                onClick={() => generateMetadata(["creative"])}
                isLoading={isGenerating && generatingField === "creative"}
              />
            </div>
          </div>

          <FormImageInput
            label="Token Image"
            onChange={(file) => setImageFile(file)}
          />

          <FormInput
            type="text"
            value={form.links.agentLink}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange("links.agentLink", e.target.value)
            }
            label="Link Agent"
            isOptional
            inputTag={
              <div className="text-[#8c8c8c] pointer-events-none p-[11px] text-base font-normal uppercase leading-normal tracking-widest">
                HTTPS://
              </div>
            }
            rightIndicator={<CopyButton text={form.links.agentLink || ""} />}
          />

          <div className="flex flex-col gap-3">
            <FormInput.Label label="add project socials" isOptional />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-6">
              <FormInput
                type="text"
                value={form.links.website}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("links.website", e.target.value)
                }
                isOptional
                inputTag={<Icons.Website />}
                placeholder="Insert a link here"
                rightIndicator={<CopyButton text={form.links.website || ""} />}
              />
              <FormInput
                type="text"
                value={form.links.twitter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("links.twitter", e.target.value)
                }
                isOptional
                inputTag={<Icons.Twitter />}
                placeholder="Insert a link here"
                rightIndicator={<CopyButton text={form.links.twitter || ""} />}
              />
              <FormInput
                type="text"
                value={form.links.telegram}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("links.telegram", e.target.value)
                }
                isOptional
                inputTag={<Icons.Telegram />}
                placeholder="Insert a link here"
                rightIndicator={<CopyButton text={form.links.telegram || ""} />}
              />
              <FormInput
                type="text"
                value={form.links.discord}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("links.discord", e.target.value)
                }
                isOptional
                inputTag={<Icons.Discord />}
                placeholder="Insert a link here"
                rightIndicator={<CopyButton text={form.links.discord || ""} />}
              />
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-6">
              <div className="flex flex-col gap-3">
                <FormInput.Label label="buy your coin" isOptional />
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max={MAX_INITIAL_SOL}
                    step="0.1"
                    value={form.initial_sol || "0"}
                    onChange={(e) =>
                      handleChange("initial_sol", e.target.value)
                    }
                    className="flex-1 h-2 bg-[#2e2e2e] appearance-none cursor-pointer accent-[#2fd345]"
                  />
                  <div className="relative">
                    <input
                      type="number"
                      value={form.initial_sol}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (
                          value === "" ||
                          (parseFloat(value) >= 0 &&
                            parseFloat(value) <= MAX_INITIAL_SOL)
                        ) {
                          handleChange("initial_sol", value);
                        }
                      }}
                      min="0"
                      max={MAX_INITIAL_SOL}
                      step="0.1"
                      className="w-27 py-2 pr-14 bg-[#2e2e2e] text-[#2fd345] text-xl font-medium text-right"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2fd345] text-xl font-medium">
                      SOL
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="bg-[#2fd345] py-3 px-6 font-bold border-2 text-black text-[1.8em] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                disabled={!isFormValid || isSubmitting || !publicKey}
              >
                {isSubmitting ? "Creating..." : "LET'S GO"}
              </button>
              {!isFormValid && (
                <p className="text-red-500 text-center text-sm m-4">
                  Please fill in all required fields
                </p>
              )}
              {!publicKey && (
                <p className="text-red-500 text-center text-sm m-4">
                  Please connect your wallet to create a token
                </p>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Create;
