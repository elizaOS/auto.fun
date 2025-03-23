import { useState } from "react";
import { useForm } from "react-hook-form";
import { useWallet } from "@solana/wallet-adapter-react";
import { useNavigate } from "react-router";
import { Icons } from "../components/icons";
import CopyButton from "../components/copy-button";
import WalletButton from "../components/wallet-button";

const MAX_FILE_SIZE_MB = 5;
const MAX_INITIAL_SOL = 45;

type TokenLinks = {
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  agentLink: string;
};

type TokenMetadataForm = {
  name: string;
  symbol: string;
  initial_sol: string;
  media_base64: File | null;
  description: string;
  links: TokenLinks;
};

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
          <div className="absolute left-3 text-[#8c8c8c]">{inputTag}</div>
        )}
        {leftIndicator && (
          <div className="absolute left-3 text-[#8c8c8c]">{leftIndicator}</div>
        )}
        <input
          className={`w-full bg-[#2e2e2e] py-2.5 px-3 rounded-md border border-neutral-800 text-white ${
            inputTag ? "pl-10" : ""
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
      <div className="text-white uppercase text-sm font-medium tracking-wider">
        {label}
      </div>
      {isOptional && <div className="text-[#8c8c8c] text-xs">Optional</div>}
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
          className="w-full bg-[#2e2e2e] py-2.5 px-3 rounded-md border border-neutral-800 text-white resize-none"
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
          file.type,
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
      <div className="relative border border-neutral-800 rounded-md p-4 bg-[#2e2e2e]">
        {preview ? (
          <div className="flex justify-center">
            <img
              src={preview}
              alt="Token preview"
              className="max-h-40 object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-neutral-600 rounded-md">
            <p className="text-[#8c8c8c] mb-2">
              Upload image (max {MAX_FILE_SIZE_MB}MB)
            </p>
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

// Main Form Component
export const Create = () => {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWalletPrompt, setShowWalletPrompt] = useState(false);

  // Simple form state
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    initial_sol: "",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: "",
    },
  });

  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    initial_sol: "",
  });

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

  // Submit form to backend
  const submitFormToBackend = async () => {
    try {
      setIsSubmitting(true);

      // Convert image to base64 if exists
      let media_base64 = null;
      if (imageFile) {
        media_base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(imageFile);
        });
      }

      // Create payload
      const payload = {
        ...form,
        media_base64,
        wallet: publicKey?.toString(),
      };

      // Submit to backend API
      const response = await fetch("/api/create-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to create token");
      }

      const data = (await response.json()) as { tokenId?: string };

      // Redirect to token page using React Router
      if (data.tokenId) {
        navigate(`/token/${data.tokenId}`);
      } else {
        console.error("No token ID returned from API");
      }
    } catch (error) {
      console.error("Error creating token:", error);
      alert("Failed to create token. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    // If not logged in, show wallet prompt
    if (!publicKey) {
      setShowWalletPrompt(true);
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
    <form
      className="flex flex-col w-full m-auto gap-7 justify-center"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
      </div>

      <FormTextArea
        value={form.description}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          handleChange("description", e.target.value)
        }
        label="Token Description"
        rightIndicator={`${form.description.length}/2000`}
        minRows={5}
        maxLength={2000}
        error={errors.description}
      />

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
          <div className="text-[#8c8c8c] text-base font-normal uppercase leading-normal tracking-widest">
            HTTPS://
          </div>
        }
        rightIndicator={<CopyButton text={form.links.agentLink || ""} />}
      />

      <div className="flex flex-col gap-3">
        <FormInput.Label label="add project socials" isOptional />
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
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
      </div>

      <div className="flex flex-col gap-3">
        <FormInput.Label label="buy your coin" isOptional />
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="grid grid-cols-3 gap-3 h-[46px]">
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() => handleChange("initial_sol", "10")}
            >
              10 SOL
            </button>
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() => handleChange("initial_sol", "25")}
            >
              25 SOL
            </button>
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() =>
                handleChange("initial_sol", MAX_INITIAL_SOL.toString())
              }
            >
              Max
            </button>
          </div>
          <FormInput
            type="number"
            step="any"
            value={form.initial_sol}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange("initial_sol", e.target.value)
            }
            placeholder={`Custom max ${MAX_INITIAL_SOL} SOL`}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (
                !/[0-9.]/.test(e.key) &&
                e.key !== "Backspace" &&
                e.key !== "Delete" &&
                e.key !== "ArrowLeft" &&
                e.key !== "ArrowRight" &&
                e.key !== "Tab"
              ) {
                e.preventDefault();
              }
            }}
            min={0}
            error={errors.initial_sol}
          />
        </div>
      </div>

      <div className="h-0.5 bg-[#262626]" />

      <div className="flex flex-col items-center">
        <div className="text-white text-base font-normal font-['DM Mono'] uppercase leading-normal tracking-widest mb-2.5">
          Continue
        </div>
        {showWalletPrompt && !publicKey ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-white mb-2">
              Connect your wallet to launch your token
            </p>
            <WalletButton />
          </div>
        ) : (
          <button
            type="submit"
            className="bg-[#2e2e2e] py-2.5 px-4 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight disabled:opacity-30"
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Launch Token"}
          </button>
        )}
      </div>
    </form>
  );
};

export default Create;
