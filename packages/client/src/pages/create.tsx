import { AutoTabContent } from "@/create/components/AutoTabContent";
import { CreationLoadingModal } from "@/create/components/CreationLoadingModal";
import { FormSection } from "@/create/components/FormSection";
import { ImportTabContent } from "@/create/components/ImportTabContent";
import { TabNavigation } from "@/create/components/TabNavigation";
import { MAX_INITIAL_SOL, TAB_STATE_KEY } from "@/create/consts";
import { useWallet } from "@/create/hooks/useWallet";
import {
  FormTab,
  PreGeneratedTokenResponse,
  TokenMetadata,
  TokenSearchData,
  UploadImportImageResponse,
} from "@/create/types";
import { isValidTokenAddress } from "@/create/validators";

import { useImageUpload } from "@/create/hooks/useImageUpload";
import { useTokenCreation } from "@/create/hooks/useTokenCreation";
import { useTokenForm } from "@/create/hooks/useTokenForm";
import { useTokenGeneration } from "@/create/hooks/useTokenGeneration";
import { useVanityAddress } from "@/create/hooks/useVanityAddress";
import useAuthentication from "@/hooks/use-authentication";
import { useSolBalance } from "@/hooks/use-token-balance";
import { getAuthToken } from "@/utils/auth";
import { env } from "@/utils/env";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

export default function Create() {
  const { isAuthenticated } = useAuthentication();
  const { publicKey, signTransaction, error: walletError } = useWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number>(0);

  useEffect(() => {
    const checkBalance = async () => {
      if (publicKey) {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);
      }
    };
    checkBalance();
  }, [publicKey, connection]);

  const navigate = useNavigate();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [coinDropImageUrl, setCoinDropImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [promptFunctions, setPromptFunctions] = useState<{
    setPrompt: ((prompt: string) => void) | null;
    onPromptChange: ((prompt: string) => void) | null;
  }>({ setPrompt: null, onPromptChange: null });

  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  const [activeTab, setActiveTab] = useState<FormTab>(() => {
    const savedTab = localStorage.getItem(TAB_STATE_KEY);
    if (savedTab && Object.values(FormTab).includes(savedTab as FormTab)) {
      return savedTab as FormTab;
    }
    return FormTab.AUTO;
  });
  const [userPrompt, setUserPrompt] = useState("");
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);

  const {
    vanitySuffix,
    setVanitySuffix,
    isGeneratingVanity,
    vanityResult,
    displayedPublicKey,
    suffixError,
    startVanityGeneration,
    stopVanityGeneration,
  } = useVanityAddress();

  useEffect(() => {
    if (
      activeTab !== FormTab.IMPORT &&
      !isGeneratingVanity &&
      !vanityResult &&
      vanitySuffix.trim() &&
      !suffixError
    ) {
      const timeoutId = setTimeout(() => {
        startVanityGeneration();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [
    activeTab,
    isGeneratingVanity,
    vanityResult,
    vanitySuffix,
    suffixError,
    startVanityGeneration,
  ]);

  useEffect(() => {
    stopVanityGeneration();
  }, [activeTab, stopVanityGeneration]);

  useEffect(() => {
    if (activeTab === FormTab.IMPORT) {
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          setHasStoredToken(true);

          setForm((prev) => ({
            ...prev,
            name: tokenData.name || tokenData.mint.slice(0, 8),
            symbol: tokenData.symbol || "TOKEN",
            description: tokenData.description || "Imported token",
            links: {
              ...prev.links,
              twitter: tokenData.twitter || "",
              telegram: tokenData.telegram || "",
              website: tokenData.website || "",
              discord: tokenData.discord || "",
            },
          }));

          if (tokenData.image) {
            setCoinDropImageUrl(tokenData.image || null);

            setTimeout(() => {
              if (previewSetterRef.current) {
                previewSetterRef.current(tokenData.image || null);
              }
            }, 100);
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
        }
      }
    }
  }, [activeTab]);

  const {
    form,
    errors: formErrors,
    handleChange: handleFormChange,
    validateForm,
    isFormValid: checkFormValid,
    setForm,
    setErrors: setFormErrors,
  } = useTokenForm({
    onFormChange: (newForm) => {
      if (activeTab === FormTab.AUTO) {
        setAutoForm((prev) => ({
          ...prev,
          name: newForm.name,
          symbol: newForm.symbol,
          description: newForm.description,
          prompt: newForm.prompt,
        }));
      } else if (activeTab === FormTab.MANUAL) {
        setManualForm((prev) => ({
          ...prev,
          name: newForm.name,
          symbol: newForm.symbol,
          description: newForm.description,
        }));
      }
    },
  });

  const [autoForm, setAutoForm] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    concept: "",
    imageUrl: null as string | null,
  });

  const [manualForm, setManualForm] = useState({
    name: "",
    symbol: "",
    description: "",
    imageFile: null as File | null,
  });

  const [currentPreGeneratedTokenId, setCurrentPreGeneratedTokenId] = useState<
    string | null
  >(null);

  const [buyValue, setBuyValue] = useState(form.initialSol || "0");

  const balance = useSolBalance();

  const maxUserSol = balance ? Math.max(0, Number(balance) - 0.025) : 0;
  const maxInputSol = Math.min(MAX_INITIAL_SOL, maxUserSol);

  const insufficientBalance =
    activeTab === FormTab.IMPORT
      ? false
      : Number(buyValue) > Number(balance || 0) - 0.05;

  const previewSetterRef = useRef<((preview: string | null) => void) | null>(
    null,
  );

  const [hasGeneratedToken, setHasGeneratedToken] = useState(false);
  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      setForm((prev) => ({
        ...prev,
        name: autoForm.name,
        symbol: autoForm.symbol,
        description: autoForm.description,
        prompt: autoForm.prompt,
      }));

      if (autoForm.imageUrl && previewSetterRef.current) {
        previewSetterRef.current(autoForm.imageUrl);
        setCoinDropImageUrl(autoForm.imageUrl);
      }
    } else if (activeTab === FormTab.MANUAL) {
      setForm((prev) => ({
        ...prev,
        name: manualForm.name,
        symbol: manualForm.symbol,
        description: manualForm.description,
      }));

      if (manualForm.imageFile) {
        setImageFile(manualForm.imageFile);
      }
    }
    stopVanityGeneration();
  }, [activeTab, stopVanityGeneration]);

  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      setAutoForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        prompt: form.prompt,
      }));
    } else if (activeTab === FormTab.MANUAL) {
      setManualForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
      }));
    }
  }, [form, activeTab]);

  useEffect(() => {
    if (form.initialSol !== buyValue) {
      setBuyValue(form.initialSol);
    }
  }, [form.initialSol]);

  const handleTabChange = (tab: FormTab) => {
    if (activeTab === FormTab.AUTO && tab !== FormTab.AUTO) {
      setAutoForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        prompt: form.prompt,
      }));
    } else if (activeTab === FormTab.MANUAL && tab !== FormTab.MANUAL) {
      setManualForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        imageFile: imageFile,
      }));
    }

    if (tab === FormTab.AUTO || tab === FormTab.MANUAL) {
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);
    } else if (tab === FormTab.IMPORT) {
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          setHasStoredToken(true);
          setForm((prev) => ({
            ...prev,
            name: tokenData.name || tokenData.mint.slice(0, 8),
            symbol: tokenData.symbol || "TOKEN",
            description: tokenData.description || "Imported token",
            links: {
              ...prev.links,
              twitter: tokenData.twitter || "",
              telegram: tokenData.telegram || "",
              website: tokenData.website || "",
              discord: tokenData.discord || "",
            },
          }));

          if (tokenData.image) {
            setCoinDropImageUrl(tokenData.image);
            if (previewSetterRef.current) {
              previewSetterRef.current(tokenData.image);
            }
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
          setHasStoredToken(false);
        }
      }
    }

    if (tab === FormTab.MANUAL) {
      setImageFile(null);
      if (previewSetterRef.current) {
        previewSetterRef.current(null);
      }
      setCoinDropImageUrl(null);
    }

    setActiveTab(tab);
    localStorage.setItem(TAB_STATE_KEY, tab);

    if (tab !== FormTab.AUTO) {
      setHasGeneratedToken(false);
    }

    setFormErrors({
      name: "",
      symbol: "",
      description: "",
      prompt: "",
      initialSol: "",
      userPrompt: "",
      importAddress: "",
      percentage: "",
    });
  };

  const handlePromptChange = (prompt: string) => {
    setForm((prev) => ({
      ...prev,
      prompt: prompt,
    }));

    if (prompt) {
      setFormErrors((prev) => ({
        ...prev,
        prompt: "",
      }));
    }
  };

  const {
    isGenerating: tokenGenerationIsGenerating,
    generationProgress,
    generatedMetadata,
    currentImageUrl,
    currentImageFile,
    generateToken,
    resetGeneration,
  } = useTokenGeneration({
    onGenerationComplete: (metadata) => {
      setAutoForm((prev) => ({
        ...prev,
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        prompt: userPrompt,
      }));
    },
    onError: (error) => {
      toast.error(error);
    },
    onImageUrlUpdate: (imageUrl, imageFile) => {
      setAutoForm((prev) => ({
        ...prev,
        imageUrl,
      }));
      if (previewSetterRef.current) {
        previewSetterRef.current(imageUrl);
      }
      setCoinDropImageUrl(imageUrl);
      if (imageFile) {
        setImageFile(imageFile);
      }
    },
  });

  const generateFromPrompt = useCallback(async () => {
    if (!userPrompt.trim()) {
      setFormErrors((prev) => ({
        ...prev,
        userPrompt: "Please enter a prompt",
      }));
      return;
    }

    setFormErrors((prev) => ({
      ...prev,
      userPrompt: "",
    }));

    setIsProcessingPrompt(true);
    setIsGenerating(true);
    setGeneratingField("name,symbol,description,prompt");

    try {
      // Reset any existing image state
      setImageFile(null);
      setCoinDropImageUrl(null);
      if (previewSetterRef.current) {
        previewSetterRef.current(null);
      }

      await generateToken(userPrompt);
    } catch (error) {
      console.error("Error generating from prompt:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate token from prompt. Please try again.",
      );
    } finally {
      setIsProcessingPrompt(false);
      setIsGenerating(false);
      setGeneratingField(null);
    }
  }, [userPrompt, generateToken]);

  const generateAll = useCallback(
    async (
      setPrompt?: ((prompt: string) => void) | null,
      onPromptChange?: ((prompt: string) => void) | null,
    ) => {
      try {
        setIsGenerating(true);
        setGeneratingField("name,symbol,description,prompt");

        // Reset any existing image state
        setImageFile(null);
        setCoinDropImageUrl(null);
        if (previewSetterRef.current) {
          previewSetterRef.current(null);
        }

        const randomConcept = "Generate a unique and creative token";
        await generateToken(randomConcept);

        if (setPrompt) setPrompt(randomConcept);
        if (onPromptChange) onPromptChange(randomConcept);

        setUserPrompt(randomConcept);
      } catch (error) {
        console.error("Error generating metadata:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to generate metadata. Please try again.",
        );
      } finally {
        setIsGenerating(false);
        setGeneratingField(null);
      }
    },
    [generateToken],
  );

  const base64ToBlob = (base64: string, type: string) => {
    const byteString = atob(base64.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type });
  };

  const loadTokenData = async () => {
    if (!isValidTokenAddress(form.importAddress)) {
      setFormErrors((prev) => ({
        ...prev,
        importAddress: "Please enter a valid token address",
      }));
      return;
    }

    setFormErrors((prev) => ({
      ...prev,
      importAddress: "",
    }));

    setIsImporting(true);
    setImportStatus(null);

    try {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const authToken = getAuthToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      try {
        const response = await fetch(`${env.apiUrl}/api/search-token`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            mint: form.importAddress,
            requestor: publicKey ? publicKey.toString() : "",
          }),
        });

        if (!response.ok) {
          try {
            const errorData = (await response.json()) as { error?: string };
            if (errorData.error) {
              throw new Error(errorData.error);
            }
          } catch (parseError) {
            if (response.status === 404) {
              throw new Error(
                "The token doesn't exist or doesn't have metadata.",
              );
            } else {
              throw new Error(
                `Server error (${response.status}): Unable to retrieve token data. Token either doesn't exist or is already imported.`,
              );
            }
          }
        }

        const tokenData = (await response.json()) as TokenSearchData & {
          isToken2022?: boolean;
        };

        if (tokenData.image) {
          try {
            const imageResponse = await fetch(tokenData.image);
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const imageFile = new File([imageBlob], "imported-image.png", {
                type: "image/png",
              });
              setImageFile(imageFile);

              const previewUrl = URL.createObjectURL(imageBlob);
              setCoinDropImageUrl(previewUrl);

              const uploadResponse = await fetch(
                `${env.apiUrl}/api/upload-import-image`,
                {
                  method: "POST",
                  headers,
                  credentials: "include",
                  body: JSON.stringify({
                    imageBase64: await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(imageBlob);
                    }),
                  }),
                },
              );

              if (uploadResponse.ok) {
                const data =
                  (await uploadResponse.json()) as UploadImportImageResponse;
                if (data.success && data.imageUrl) {
                  tokenData.image = data.imageUrl;
                  setCoinDropImageUrl(data.imageUrl);
                  if (previewSetterRef.current) {
                    previewSetterRef.current(data.imageUrl);
                  }
                }
              }
            }
          } catch (error) {
            console.error("Error handling token image:", error);
          }
        }

        localStorage.setItem("import_token_data", JSON.stringify(tokenData));
        setHasStoredToken(true);

        setForm((prev) => ({
          ...prev,
          name: tokenData.name || form.importAddress.slice(0, 8),
          symbol: tokenData.symbol || "TOKEN",
          description: tokenData.description || "Imported token",
          links: {
            ...prev.links,
            twitter: tokenData.twitter || "",
            telegram: tokenData.telegram || "",
            website: tokenData.website || "",
            discord: tokenData.discord || "",
          },
        }));

        setImportStatus({
          type: "success",
          message:
            "Token data loaded successfully. You can now import this token.",
        });
      } catch (fetchError) {
        console.error("API Error:", fetchError);
        setImportStatus({
          type: "error",
          message:
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to import token",
        });
      }
    } catch (error) {
      console.error("Error importing token:", error);
      setImportStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to import token",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const importToken = async () => {
    if (!hasStoredToken) {
      toast.error("Please load token data via the import field above.");
      return;
    }

    try {
      setIsSubmitting(true);

      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const storedTokenData = localStorage.getItem("import_token_data");
      if (!storedTokenData) {
        throw new Error("No token data found");
      }

      const tokenData = JSON.parse(storedTokenData) as TokenSearchData & {
        isToken2022?: boolean;
      };

      // Convert image to base64 if exists
      let media_base64: string | null = null;
      if (imageFile) {
        media_base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(imageFile);
        });
      }

      const authToken = getAuthToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const createResponse = await fetch(env.apiUrl + "/api/create-token", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          tokenMint: tokenData.mint,
          mint: tokenData.mint,
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          twitter: form.links.twitter,
          telegram: form.links.telegram,
          website: form.links.website,
          discord: form.links.discord,
          imageBase64: media_base64,
          metadataUrl: tokenData.metadataUri || "",
          creator:
            tokenData.creators || // Use updateAuthority/creator from search result
            tokenData.updateAuthority ||
            tokenData.creator || // Fallback to creator if others missing
            "", // Or handle error if no creator found
          imported: true,
          isToken2022: tokenData.isToken2022 === true,
        }),
      });

      if (!createResponse.ok) {
        const errorData = (await createResponse.json()) as {
          error?: string;
        };
        throw new Error(errorData.error || "Failed to create token entry");
      }

      // Clear imported token data from localStorage
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);

      // Trigger confetti to celebrate successful registration
      if (window.createConfettiFireworks) {
        window.createConfettiFireworks();
      }

      // Redirect to token page
      navigate(`/token/${tokenData.mint}`);
    } catch (error) {
      console.error("Error submitting import form:", error);

      if (
        error instanceof Error &&
        error.message.includes("Token already exists")
      ) {
        const storedTokenData = localStorage.getItem("import_token_data");
        if (storedTokenData) {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          navigate(`/token/${tokenData.mint}`);
          return;
        }
      }

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to import token. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (activeTab === FormTab.IMPORT) {
      await importToken();
      return;
    }

    if (!vanityResult || isGeneratingVanity) {
      toast.error("Please generate and wait for a vanity address.");
      return;
    }

    if (isAuthenticated && insufficientBalance) {
      setFormErrors((prev) => ({
        ...prev,
        initialSol: "Insufficient SOL balance (need 0.05 SOL for fees)",
      }));
      toast.error("You don't have enough SOL to create this token");
      return;
    }

    await submitFormToBackend(e);
  };

  useEffect(() => {
    const loadPreGeneratedToken = async () => {
      if (activeTab === FormTab.AUTO && !hasGeneratedToken) {
        try {
          setIsGenerating(true);
          setGeneratingField("name,symbol,description,prompt");

          const authToken = getAuthToken();

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          const response = await fetch(
            env.apiUrl + "/api/generation/pre-generated-token",
            {
              method: "GET",
              headers,
              credentials: "include",
            },
          );

          if (!response.ok) {
            throw new Error("Failed to get pre-generated token");
          }

          const data = (await response.json()) as PreGeneratedTokenResponse;
          const { token } = data;

          if (token.id) {
            setCurrentPreGeneratedTokenId(token.id);
          }

          setUserPrompt(token.prompt);

          setForm((prev) => ({
            ...prev,
            name: token.name,
            symbol: token.ticker,
            description: token.description,
            prompt: token.prompt,
          }));

          setAutoForm((prev) => ({
            ...prev,
            name: token.name,
            symbol: token.ticker,
            description: token.description,
            prompt: token.prompt,
            concept: token.prompt,
          }));

          if (promptFunctions.setPrompt)
            promptFunctions.setPrompt(token.prompt);
          if (promptFunctions.onPromptChange)
            promptFunctions.onPromptChange(token.prompt);

          if (token.image) {
            let imageUrl = token.image;
            if (
              imageUrl.includes("r2.dev") &&
              env.apiUrl?.includes("localhost") &&
              env.apiUrl?.includes("127.0.0.1")
            ) {
              const filename = imageUrl.split("/").pop();
              imageUrl = `${env.apiUrl}/api/image/${filename}`;
            }

            const imageBlob = await fetch(imageUrl).then((r) => r.blob());
            const imageFile = new File([imageBlob], "pre-generated-image.png", {
              type: "image/png",
            });

            setImageFile(imageFile);

            const previewUrl = URL.createObjectURL(imageBlob);
            setCoinDropImageUrl(previewUrl);
            setAutoForm((prev) => ({
              ...prev,
              imageUrl: previewUrl,
            }));

            if (previewSetterRef.current) {
              previewSetterRef.current(previewUrl);
            }
          }

          setHasGeneratedToken(true);
        } catch (error) {
          console.error("Error loading pre-generated token:", error);
        } finally {
          setIsGenerating(false);
          setGeneratingField(null);
        }
      }
    };

    loadPreGeneratedToken();
  }, [
    activeTab,
    promptFunctions.setPrompt,
    promptFunctions.onPromptChange,
    hasGeneratedToken,
  ]);

  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      if (autoForm.imageUrl && previewSetterRef.current) {
        previewSetterRef.current(autoForm.imageUrl);
        setCoinDropImageUrl(autoForm.imageUrl);
      }
    } else if (activeTab === FormTab.MANUAL) {
      if (manualForm.imageFile) {
        const manualImageUrl = URL.createObjectURL(manualForm.imageFile);
        setImageFile(manualForm.imageFile);
        if (previewSetterRef.current) {
          previewSetterRef.current(manualImageUrl);
        }
        setCoinDropImageUrl(manualImageUrl);
      } else {
        setImageFile(null);
        if (previewSetterRef.current) {
          previewSetterRef.current(null);
        }
        setCoinDropImageUrl(null);
      }
    } else if (activeTab === FormTab.IMPORT && hasStoredToken) {
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          if (tokenData.image && previewSetterRef.current) {
            previewSetterRef.current(tokenData.image);
            setCoinDropImageUrl(tokenData.image);
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
        }
      }
    }

    stopVanityGeneration();
    setVanitySuffix("FUN");
  }, [
    activeTab,
    autoForm.imageUrl,
    manualForm.imageFile,
    hasStoredToken,
    stopVanityGeneration,
    setVanitySuffix,
  ]);

  useEffect(() => {
    if (activeTab === FormTab.MANUAL && imageFile) {
      setManualForm((prev) => ({
        ...prev,
        imageFile: imageFile,
      }));
    }
  }, [imageFile, activeTab]);

  useEffect(() => {
    const createdUrls: string[] = [];

    return () => {
      createdUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    const prevImageUrl = autoForm.imageUrl;

    return () => {
      if (prevImageUrl && prevImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prevImageUrl);
      }
    };
  }, [autoForm.imageUrl]);

  const autoTabErrors: {
    userPrompt?: string;
    [k: string]: string | undefined;
  } = {
    userPrompt: formErrors.userPrompt,
  };

  const importTabErrors: {
    importAddress?: string;
    [k: string]: string | undefined;
  } = {
    importAddress: formErrors.importAddress,
  };

  const canLaunch = useCallback(() => {
    if (!publicKey) return false;
    if (activeTab === FormTab.IMPORT) {
      return hasStoredToken && !isImporting;
    }
    const initialSol = parseFloat(form.initialSol) || 0;
    const hasEnoughSol = solBalance >= initialSol + 0.01;
    const hasVanityKey = !!vanityResult?.publicKey && !isGeneratingVanity;
    return (
      hasEnoughSol &&
      checkFormValid() &&
      hasVanityKey &&
      !Object.values(formErrors).some(
        (error) =>
          error &&
          !["userPrompt", "importAddress", "percentage"].includes(error),
      )
    );
  }, [
    publicKey,
    activeTab,
    hasStoredToken,
    isImporting,
    form.initialSol,
    solBalance,
    vanityResult,
    isGeneratingVanity,
    checkFormValid,
    formErrors,
  ]);

  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 90);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const {
    isUploading,
    uploadProgress,
    uploadedImageUrl,
    handleImageUpload,
    resetUpload,
  } = useImageUpload({
    onImageUploaded: (url) => {
      setCoinDropImageUrl(url);
      if (previewSetterRef.current) {
        previewSetterRef.current(url);
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  const handleImageChange = useCallback(
    async (file: File | null) => {
      if (!file) {
        resetUpload();
        setImageFile(null);
        setCoinDropImageUrl(null);
        if (previewSetterRef.current) {
          previewSetterRef.current(null);
        }
        return;
      }

      setImageFile(file);

      const previewUrl = URL.createObjectURL(file);
      setCoinDropImageUrl(previewUrl);
      if (previewSetterRef.current) {
        previewSetterRef.current(previewUrl);
      }

      if (activeTab === FormTab.MANUAL) {
        setManualForm((prev) => ({
          ...prev,
          imageFile: file,
        }));
      }

      try {
        // Convert file to base64 with proper format
        const imageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            // Ensure the base64 string has the proper data URL format
            if (!base64String.startsWith("data:")) {
              resolve(`data:${file.type};base64,${base64String.split(",")[1]}`);
            } else {
              resolve(base64String);
            }
          };
          reader.readAsDataURL(file);
        });

        console.log(
          "Image base64 format:",
          imageBase64.substring(0, 50) + "...",
        ); // Debug log

        const tokenMetadata: TokenMetadata = {
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          initialSol: parseFloat(form.initialSol) || 0,
          links: form.links,
          imageBase64,
          tokenMint: vanityResult?.publicKey || "",
          decimals: 9,
          supply: 1000000000000000,
          freezeAuthority: publicKey?.toBase58() || "",
          mintAuthority: publicKey?.toBase58() || "",
        };

        await handleImageUpload(file, tokenMetadata);
      } catch (error) {
        console.error("Error uploading image:", error);
        toast.error("Failed to upload image. Please try again.");
      }
    },
    [activeTab, handleImageUpload, resetUpload, form, vanityResult, publicKey],
  );

  const handleImportAddressPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pastedText = e.clipboardData.getData("text");

    if (!isValidTokenAddress(pastedText)) {
      e.preventDefault();

      setFormErrors((prev) => ({
        ...prev,
        importAddress:
          "Invalid token address format. Please check and try again.",
      }));

      return false;
    }

    setFormErrors((prev) => ({
      ...prev,
      importAddress: "",
    }));

    return true;
  };

  const handlePreviewChange = useCallback((previewUrl: string | null) => {
    setCoinDropImageUrl(previewUrl);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isCreating, creationStep, creationStage, createToken } =
    useTokenCreation({
      publicKey: publicKey?.toBase58() || null,
      signTransaction: signTransaction || null,
    });

  const submitFormToBackend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (!vanityResult?.publicKey || !vanityResult?.secretKey) {
        toast.error("Please generate a vanity address first.");
        return;
      }

      const tokenMetadata: TokenMetadata = {
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        initialSol: parseFloat(form.initialSol) || 0,
        links: form.links,
        imageBase64: null,
        tokenMint: vanityResult.publicKey,
        decimals: 9,
        supply: 1000000000000000,
        freezeAuthority: publicKey?.toBase58() || "",
        mintAuthority: publicKey?.toBase58() || "",
      };

      await createToken(
        tokenMetadata,
        vanityResult.secretKey,
        vanityResult,
        imageFile,
        currentPreGeneratedTokenId || undefined,
        userPrompt || undefined,
        activeTab,
      );
    } catch (error) {
      console.error("Error creating token:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create token. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <form
        className="py-4 px-auto w-full max-w-2xl flex font-dm-mono flex-col m-auto gap-1 justify-center"
        onSubmit={handleSubmit}
      >
        <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

        {activeTab === FormTab.AUTO && (
          <AutoTabContent
            userPrompt={userPrompt}
            setUserPrompt={setUserPrompt}
            errors={autoTabErrors}
            isProcessingPrompt={isProcessingPrompt}
            generateFromPrompt={generateFromPrompt}
          />
        )}

        {activeTab === FormTab.IMPORT && (
          <ImportTabContent
            importAddress={form.importAddress}
            onImportAddressChange={(val) =>
              handleFormChange("importAddress", val)
            }
            handleImportAddressPaste={handleImportAddressPaste}
            errors={importTabErrors}
            isImporting={isImporting}
            isValidTokenAddress={isValidTokenAddress}
            importTokenFromAddress={loadTokenData}
            importStatus={importStatus}
          />
        )}

        <FormSection
          activeTab={activeTab}
          hasGeneratedToken={hasGeneratedToken}
          hasStoredToken={hasStoredToken}
          form={form}
          errors={formErrors}
          isGenerating={isGenerating}
          generatingField={generatingField}
          imageFile={imageFile}
          coinDropImageUrl={coinDropImageUrl}
          autoForm={autoForm}
          manualForm={manualForm}
          buyValue={buyValue}
          solBalance={solBalance}
          isAuthenticated={isAuthenticated}
          isFormValid={checkFormValid()}
          insufficientBalance={insufficientBalance}
          maxInputSol={maxInputSol}
          isSubmitting={isSubmitting}
          isCreating={isCreating}
          canLaunch={canLaunch}
          onImageChange={handleImageChange}
          onPromptChange={handlePromptChange}
          onPromptFunctionsChange={(setPrompt, onPromptChange) => {
            setPromptFunctions({ setPrompt, onPromptChange });
          }}
          onPreviewChange={handlePreviewChange}
          onDirectPreviewSet={(setter) => {
            previewSetterRef.current = setter;
          }}
          onNameChange={(value) => handleFormChange("name", value)}
          onTickerChange={(value) => handleFormChange("symbol", value)}
          onDescriptionChange={(value) =>
            handleFormChange("description", value)
          }
          onBuyValueChange={(value) => {
            handleFormChange("initialSol", value || "0");
            setBuyValue(value.toString());
          }}
          onGenerateAll={() =>
            generateAll(
              promptFunctions.setPrompt,
              promptFunctions.onPromptChange,
            )
          }
          isGeneratingVanity={isGeneratingVanity}
          displayedPublicKey={displayedPublicKey}
          vanitySuffix={vanitySuffix}
          vanityResult={vanityResult}
          suffixError={suffixError}
          onSuffixChange={(suffix) => {
            stopVanityGeneration();
            setVanitySuffix(suffix);
          }}
          onGenerateClick={() => {
            stopVanityGeneration();
            setTimeout(() => {
              startVanityGeneration();
            }, 50);
          }}
        />
      </form>

      <CreationLoadingModal
        isCreating={isCreating}
        creationStep={creationStep}
        creationStage={creationStage}
      />
    </div>
  );
}
