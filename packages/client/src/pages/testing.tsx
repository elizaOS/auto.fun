import { env } from "@/utils/env";
import { useCallback, useEffect, useState, useRef } from "react"; // Added useRef
import Button from "@/components/button"; // Import Button component
// --- Vanity Generator Logic ---
// Import the worker using Vite's ?worker syntax
import InlineVanityWorker from "@/workers/vanityWorker?worker&inline";

// Storage keys
const STORAGE_KEY = "twitter-oauth-token";
const PENDING_SHARE_KEY = "pending-twitter-share";

// Types
type Credentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type PendingShare = {
  text: string;
  imageData: string;
};

// Vanity Generator Types
type VanityResult = {
  publicKey: string;
  secretKey: string;
};
type WorkerMessage =
  | {
      type: "found";
      workerId: number;
      publicKey: string;
      secretKey: string;
      validated: boolean;
    }
  | { type: "progress"; workerId: number; count: number }
  | { type: "error"; workerId: number; error: string };

export default function TwitterSharePage() {
  // --- Twitter State ---
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [apiUrlStatus, setApiUrlStatus] = useState<"checking" | "ok" | "error">(
    "checking",
  );
  const [tokenStatus, setTokenStatus] = useState<"valid" | "expired" | "none">(
    "none",
  );

  // --- Vanity Generator State ---
  const [vanitySuffix, setVanitySuffix] = useState("fun");
  const [isGenerating, setIsGenerating] = useState(false);
  const [vanityLogs, setVanityLogs] = useState<string[]>([
    "Ready to start generating.",
  ]);
  const [vanityResult, setVanityResult] = useState<VanityResult | null>(null);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [generationRate, setGenerationRate] = useState(0);
  const workersRef = useRef<Worker[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const logUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptBatchRef = useRef<number>(0); // Batch attempts for smoother rate update

  // --- OG Image Test State ---
  const [ogTestMint, setOgTestMint] = useState<string>(
    "8btUuvx2Bu4zTd8g1tN5wCKMULyPgqiPaDiJbFbWkFUN",
  ); // <<< Set default mint
  const [ogPreviewUrl, setOgPreviewUrl] = useState<string | null>(null);
  const [ogIsLoading, setOgIsLoading] = useState<boolean>(false);
  const [ogError, setOgError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null); // Ref for image load/error events
  // --- End OG Image Test State ---

  // --- Helper to add logs ---
  const addVanityLog = useCallback((message: string) => {
    setVanityLogs((prevLogs) => {
      // Keep logs reasonable, e.g., max 100 entries
      const newLogs = [...prevLogs, message];
      if (newLogs.length > 100) {
        return newLogs.slice(newLogs.length - 100);
      }
      return newLogs;
    });
  }, []);

  // --- Twitter Effects & Logic ---
  useEffect(() => {
    const apiUrl = env.apiUrl;
    if (!apiUrl) {
      console.error("VITE_API_URL is not defined in environment variables");
      setApiUrlStatus("error");
      setShareError("Twitter API configuration error: missing API URL");
    } else {
      setApiUrlStatus("ok");
    }
  }, []);

  useEffect(() => {
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(storedCredentials) as Credentials;
        if (parsedCredentials.expiresAt < Date.now()) {
          setTokenStatus("expired");
        } else {
          setCredentials(parsedCredentials);
          setTokenStatus("valid");
        }
      } catch (error) {
        console.error("Failed to parse stored credentials", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    const urlParams = new URLSearchParams(globalThis.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";
    if (freshAuth) {
      const pendingShare = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShare) {
        try {
          const share = JSON.parse(pendingShare) as PendingShare;
          const storedCreds = localStorage.getItem(STORAGE_KEY);
          if (storedCreds) {
            const parsedCreds = JSON.parse(storedCreds) as Credentials;
            setCredentials(parsedCreds);
            setTokenStatus("valid");
            handleTwitterShare(share.text, share.imageData, parsedCreds); // No await needed here?
          } else {
            throw new Error("No credentials found after authentication");
          }
          localStorage.removeItem(PENDING_SHARE_KEY);
        } catch (error) {
          setShareError(
            error instanceof Error ? error.message : "Failed to process share",
          );
        }
      }
      globalThis.history.replaceState({}, "", globalThis.location.pathname);
    }
  }, []); // Removed handleTwitterShare from dependencies

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCredentials(null);
    setTokenStatus("none");
    setShareSuccess(false);
    setShareError(null);
  }, []);

  const handleTwitterShare = useCallback(
    async (
      // Added useCallback wrapper
      text: string,
      imageData: string,
      creds: Credentials,
    ) => {
      try {
        if (creds.expiresAt < Date.now()) {
          setTokenStatus("expired");
          throw new Error(
            "Twitter authentication expired. Please log in again.",
          );
        }
        setShareError(null);
        try {
          const mediaId = await uploadImage(imageData, creds.accessToken);
          await postTweet(text, mediaId, creds.accessToken);
          setShareSuccess(true);
        } catch (error) {
          setShareError(
            error instanceof Error ? error.message : "Share failed",
          );
          throw error;
        }
      } catch (error) {
        setShareError(error instanceof Error ? error.message : "Share failed");
        throw error;
      }
    },
    [setTokenStatus, setShareError, setShareSuccess],
  ); // Added dependencies

  const handleShare = useCallback(async () => {
    if (apiUrlStatus !== "ok") {
      setShareError("Twitter API configuration error.");
      return;
    }
    if (tokenStatus === "expired" && credentials) {
      setShareError("Your Twitter authorization has expired.");
      logout();
      return;
    }

    setIsSharing(true);
    setShareError(null);
    setShareSuccess(false);

    try {
      const dummyImage = await createDummyImage();
      const shareText = "Sharing from my awesome app! #TestShare";

      if (credentials && tokenStatus === "valid") {
        await handleTwitterShare(shareText, dummyImage, credentials);
      } else {
        const pendingShare: PendingShare = {
          text: shareText,
          imageData: dummyImage,
        };
        localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(pendingShare));
        const apiUrl = env.apiUrl;
        if (!apiUrl) {
          throw new Error("API URL is not configured.");
        }
        globalThis.location.href = `${apiUrl}/api/share/oauth/request_token`;
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Share failed");
    } finally {
      setIsSharing(false);
    }
  }, [credentials, apiUrlStatus, tokenStatus, logout, handleTwitterShare]); // Added handleTwitterShare

  const uploadImage = useCallback(
    async (imageData: string, accessToken: string): Promise<string> => {
      try {
        const response = await fetch(imageData);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append("media", blob, "share-image.png");

        const uploadResponse = await fetch(`${env.apiUrl}/api/share/tweet`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload image: ${errorText}`);
        }

        const responseData = (await uploadResponse.json()) as {
          success: boolean;
          mediaId: string;
        };
        if (!responseData.mediaId) {
          throw new Error("No media ID received");
        }
        return responseData.mediaId;
      } catch (error) {
        if (error instanceof Error && error.message.includes("expired")) {
          setTokenStatus("expired");
        }
        throw error;
      }
    },
    [setTokenStatus],
  ); // Added setTokenStatus dependency

  const postTweet = useCallback(
    async (text: string, mediaId: string, accessToken: string) => {
      try {
        const response = await fetch(`${env.apiUrl}/api/share/tweet`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, mediaId }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to post tweet: ${errorText}`);
        }
        return await response.json();
      } catch (error) {
        if (error instanceof Error && error.message.includes("expired")) {
          setTokenStatus("expired");
        }
        throw error;
      }
    },
    [setTokenStatus],
  ); // Added setTokenStatus dependency

  const createDummyImage = async (): Promise<string> => {
    return env.exampleImageUrl;
  };

  // --- Vanity Generator Logic ---

  const stopVanityGeneration = useCallback(() => {
    if (!isGenerating) return;
    addVanityLog("ℹ️ Stopping workers...");
    workersRef.current.forEach((worker) => {
      // Send stop message first
      try {
        worker.postMessage("stop");
      } catch (e) {
        console.warn("Couldn't send stop message to worker", e);
      }
      // Then terminate after a short delay or immediately
      // Using terminate directly is more forceful if postMessage isn't reliable
      setTimeout(() => {
        try {
          worker.terminate();
        } catch (e) {
          // do nothing
        }
      }, 100); // Short delay to allow worker to potentially finish current task gracefully
    });
    workersRef.current = [];
    setIsGenerating(false);
    startTimeRef.current = null;
    attemptBatchRef.current = 0;
    if (logUpdateTimerRef.current) {
      clearInterval(logUpdateTimerRef.current);
      logUpdateTimerRef.current = null;
    }

    const elapsed = startTimeRef.current
      ? ((Date.now() - startTimeRef.current) / 1000).toFixed(2)
      : 0;
    const attempts = totalAttempts.toLocaleString(); // Format here for the log
    addVanityLog(
      `ℹ️ Generation stopped after ${elapsed} seconds and ${attempts} attempts.`,
    );
  }, [isGenerating, addVanityLog, totalAttempts]); // Removed totalAttempts from dep array as it's captured, added it back for the final log

  const startVanityGeneration = useCallback(() => {
    const suffix = vanitySuffix.trim();
    if (!suffix) {
      addVanityLog("❌ Please enter a valid suffix.");
      return;
    }
    if (isGenerating) return;

    setIsGenerating(true);
    setVanityLogs([`ℹ️ Preparing generation for suffix: "${suffix}"...`]); // Clear previous logs
    setVanityResult(null);
    setTotalAttempts(0); // Reset total attempts here
    setGenerationRate(0);
    attemptBatchRef.current = 0;

    const numWorkers = navigator.hardwareConcurrency || 4;
    addVanityLog(`ℹ️ Starting ${numWorkers} workers...`);
    startTimeRef.current = Date.now();
    workersRef.current = [];

    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = new InlineVanityWorker();

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          // Use isGenerating ref to check current state, avoid stale closure
          if (
            !workersRef.current.includes(worker) &&
            event.data.type !== "found"
          )
            return; // Ignore messages if stopped/terminated

          const data = event.data;
          switch (data.type) {
            case "found":
              if (data.validated) {
                addVanityLog(`✅ Worker ${data.workerId} found match!`);
                addVanityLog(`   Address: ${data.publicKey}`);
                addVanityLog(`   Secret Key: [REDACTED]`); // Don't log the secret key
                setVanityResult({
                  publicKey: data.publicKey,
                  secretKey: data.secretKey,
                });
              } else {
                addVanityLog(
                  `⚠️ Worker ${data.workerId} found potential match but validation failed. Ignoring.`,
                );
                console.warn("Validation failed for keypair:", data);
              }
              stopVanityGeneration(); // Stop all workers on find
              break;
            case "progress":
              attemptBatchRef.current += data.count;
              break;
            case "error":
              addVanityLog(`❌ Worker ${data.workerId} error: ${data.error}`);
              // Log the specific error received from the worker
              console.error(
                `Error message from worker ${data.workerId}:`,
                data.error,
              );
              // Optionally stop all if one worker fails critically
              // stopVanityGeneration();
              break;
          }
        };

        worker.onerror = (err) => {
          // Log the entire error event for more details
          console.error(`Worker ${i} fatal error event:`, err);
          addVanityLog(
            `❌ Worker ${i} fatal error: ${err.message || "Unknown error (check console)"}`,
          );
          // Remove the failing worker
          workersRef.current = workersRef.current.filter((w) => w !== worker);
          // Check if isGenerating is still true before declaring all workers failed
          if (workersRef.current.length === 0 && isGenerating) {
            addVanityLog("❌ All workers failed! Stopping generation.");
            stopVanityGeneration();
          }
          // Terminate the worker instance explicitly, just in case
          try {
            worker.terminate();
          } catch (e) {
            // do nothing
          }
        };

        // Start the worker
        worker.postMessage({ suffix, workerId: i });
        workersRef.current.push(worker);
      } catch (workerError) {
        addVanityLog(
          `❌ Failed to create worker ${i}: ${workerError instanceof Error ? workerError.message : String(workerError)}`,
        );
        console.error(`Failed to create worker ${i}:`, workerError); // Log full error
      }
    }

    if (workersRef.current.length > 0) {
      addVanityLog(
        `ℹ️ Successfully started ${workersRef.current.length} workers.`,
      );
      // Start timer to update rate periodically
      logUpdateTimerRef.current = setInterval(() => {
        const currentAttemptsInBatch = attemptBatchRef.current;
        attemptBatchRef.current = 0; // Reset batch count

        // Update total attempts using functional update to avoid stale state
        setTotalAttempts((prevTotal) => prevTotal + currentAttemptsInBatch);

        // Calculate rate based on the potentially updated total attempts
        setTotalAttempts((currentTotal) => {
          const elapsedTime = startTimeRef.current
            ? (Date.now() - startTimeRef.current) / 1000
            : 1;
          setGenerationRate(
            elapsedTime > 0 ? Math.round(currentTotal / elapsedTime) : 0,
          );
          return currentTotal; // Return the same value, just using the callback for timing
        });
      }, 1000); // Update rate every second
    } else {
      addVanityLog("❌ Failed to start any workers. Stopping generation.");
      setIsGenerating(false); // Ensure state is reset
      startTimeRef.current = null;
    }
  }, [vanitySuffix, isGenerating, addVanityLog, stopVanityGeneration]); // Removed totalAttempts from deps

  // --- OG Image Test Logic ---
  const generateOgImageUrl = (mint: string, refresh: boolean = false) => {
    if (!mint.trim()) {
      setOgError("Please enter a token mint address.");
      setOgPreviewUrl(null);
      return null;
    }
    let imageUrl = `${env.apiUrl}/api/og-image/${mint.trim()}.png?timestamp=${Date.now()}`;
    if (refresh) {
      imageUrl += "&refresh=true";
    }
    return imageUrl;
  };

  const handleOgTestGenerate = () => {
    const imageUrl = generateOgImageUrl(ogTestMint);
    if (!imageUrl) return;

    setOgError(null);
    setOgIsLoading(true);
    setOgPreviewUrl(null); // Clear previous image before setting new one
    console.log(`Setting OG image preview URL to: ${imageUrl}`);
    setOgPreviewUrl(imageUrl);
  };

  const handleOgRefresh = () => {
    const imageUrl = generateOgImageUrl(ogTestMint, true); // Pass refresh=true
    if (!imageUrl) return;

    setOgError(null);
    setOgIsLoading(true);
    setOgPreviewUrl(null); // Clear previous image before setting new one
    console.log(`Setting REFRESHED OG image preview URL to: ${imageUrl}`);
    setOgPreviewUrl(imageUrl);
  };

  const handleImageLoad = () => {
    console.log("OG Image loaded successfully.");
    setOgIsLoading(false);
    setOgError(null);
  };

  const handleImageError = () => {
    console.error("Failed to load OG Image from generated URL.");
    setOgIsLoading(false);
    setOgError("Failed to load image. Check the mint address or server logs.");
    setOgPreviewUrl(null); // Clear the broken image link
  };

  // Cleanup workers on component unmount
  useEffect(() => {
    // Store the ref value in a variable before returning the cleanup function
    const workersToTerminate = workersRef.current;
    const timerToClear = logUpdateTimerRef.current;
    return () => {
      workersToTerminate.forEach((worker) => {
        try {
          worker.postMessage("stop");
        } catch (e) {
          console.warn("Couldn't send stop message to worker", e);
        }
        try {
          worker.terminate();
        } catch (e) {
          console.warn("Couldn't terminate worker", e);
        }
      });
      workersRef.current = []; // Clear the ref on unmount
      if (timerToClear) {
        clearInterval(timerToClear);
      }
    };
  }, []); // Run only on mount and unmount

  // --- Render ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white divide-y divide-gray-700">
      {/* --- Twitter Share Section --- */}
      <div className="w-full max-w-md py-12">
        <h1 className="text-4xl font-bold mb-8 text-[#00FF04] text-center">
          Twitter Share Demo
        </h1>

        {/* Display image to share */}
        <div className="mb-8 border border-gray-700 overflow-hidden w-full">
          <img
            src={env.exampleImageUrl}
            alt="Share Preview"
            className="w-full h-auto"
          />
        </div>

        {/* Auth status */}
        {credentials && (
          <div className="mb-4 p-3 bg-gray-800 w-full">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-400 text-sm">Logged in:</span>
                <span className="font-mono ml-2 text-sm">
                  {credentials.userId}
                </span>
                <span className="ml-2 text-xs">
                  {tokenStatus === "valid" ? (
                    <span className="text-green-400">✓ Valid</span>
                  ) : (
                    <span className="text-red-400">⚠ Expired</span>
                  )}
                </span>
              </div>
              <button
                onClick={logout}
                className="text-red-400 hover:text-red-300 px-2 py-1 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {/* API configuration status */}
        {apiUrlStatus === "error" && (
          <div className="mb-4 p-3 bg-red-800/30 border border-red-600 w-full text-red-300 text-sm">
            <p>Twitter API configuration error</p>
            <p className="text-xs mt-1">
              Check VITE_API_URL environment variable
            </p>
          </div>
        )}

        {/* Share button */}
        <div className="text-center">
          <button
            onClick={handleShare}
            disabled={
              isSharing || apiUrlStatus === "error" || tokenStatus === "expired"
            }
            className="bg-[#00FF04] hover:bg-[#00FF04]/80 text-black font-bold py-3 px-6 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSharing
              ? "Sharing..."
              : credentials
                ? "Share on Twitter"
                : "Connect & Share on Twitter"}
          </button>
        </div>

        {/* Success message */}
        {shareSuccess && (
          <div className="mt-6 p-4 bg-green-800/20 border border-green-600 text-green-400 w-full text-sm">
            Successfully shared to Twitter!
          </div>
        )}

        {/* Error message */}
        {shareError && (
          <div className="mt-6 p-4 bg-red-800/20 border border-red-600 text-red-400 w-full text-sm">
            {shareError}
          </div>
        )}

        {/* Debug section */}
        <div className="mt-8 p-4 bg-gray-800 w-full text-xs text-gray-400">
          <h3 className="font-bold mb-2">Debug Information</h3>
          <div>API URL: {env.apiUrl || "Not set"}</div>
          <div>
            Auth Status: {credentials ? "Authenticated" : "Not authenticated"}
          </div>
          <div>Token Status: {tokenStatus}</div>
          {credentials && (
            <div>
              Token Expires: {new Date(credentials.expiresAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* --- Solana Vanity Address Generator Section --- */}
      <div className="w-full max-w-xl py-12">
        <h2 className="text-3xl font-bold mb-6 text-[#00FF04] text-center">
          Solana Vanity Address Generator
        </h2>
        <p className="text-center text-gray-400 mb-6 text-sm">
          Generate a Solana address ending with a specific suffix. Runs locally
          in your browser using Web Workers.
        </p>

        <div className="flex items-center gap-4 mb-4 bg-gray-800 p-4">
          <label htmlFor="suffix" className="text-gray-300 font-medium">
            Suffix:
          </label>
          <input
            type="text"
            id="suffix"
            value={vanitySuffix}
            onChange={(e) => setVanitySuffix(e.target.value)}
            className="flex-grow bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00FF04]"
            disabled={isGenerating}
          />
          <button
            onClick={startVanityGeneration}
            disabled={isGenerating || !vanitySuffix.trim()}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start
          </button>
          <button
            onClick={stopVanityGeneration}
            disabled={!isGenerating}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop
          </button>
        </div>

        {/* Status/Logs Display */}
        <div className="mb-4 p-4 bg-gray-800 border border-gray-700 h-64 overflow-y-auto text-sm font-mono">
          <p className="text-gray-400 mb-2">
            Status:{" "}
            {isGenerating
              ? `Generating... (Rate: ${generationRate.toLocaleString()}/sec)`
              : "Idle"}
          </p>
          <p className="text-gray-400 mb-4">
            Total Attempts: {totalAttempts.toLocaleString()}
          </p>
          <pre className="whitespace-pre-wrap break-words">
            {vanityLogs.map((log, index) => (
              <div
                key={index}
                className={`${log.startsWith("✅") ? "text-green-400" : log.startsWith("❌") ? "text-red-400" : log.startsWith("⚠️") ? "text-yellow-400" : "text-gray-300"}`}
              >
                {log}
              </div>
            ))}
          </pre>
        </div>

        {/* Result Display */}
        {vanityResult && (
          <div className="p-4 bg-green-800/20 border border-green-600 text-green-300">
            <h3 className="font-bold mb-2">🎉 Success! Keypair Found:</h3>
            <p className="font-mono break-all mb-1">
              <strong className="text-green-200">Address:</strong>{" "}
              {vanityResult.publicKey}
            </p>
            <p className="font-mono break-all">
              <strong className="text-green-200">Secret Key:</strong>{" "}
              {vanityResult.secretKey}
            </p>
            <p className="text-xs mt-3 text-green-400">
              Save the <strong className="font-bold">Secret Key</strong>{" "}
              securely. You can import it into wallets like Phantom.
            </p>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500 text-center p-3 bg-yellow-900/20 border border-yellow-700">
          <strong>Disclaimer:</strong> This tool generates keys locally in your
          browser. No data is sent externally. However, for managing significant
          assets, always prefer official, well-audited Solana software and
          hardware wallets. Handle generated secret keys with extreme care.
        </div>
      </div>

      {/* --- OG Image Generator Test Section --- */}
      <div className="w-full max-w-2xl py-12">
        <h2 className="text-3xl font-bold mb-6 text-[#00FF04] text-center">
          OG Image Generator Test
        </h2>
        <p className="text-center text-gray-400 mb-6 text-sm">
          Enter a token mint address to preview its generated Open Graph image.
        </p>

        <div className="flex items-center gap-4 mb-4 bg-gray-800 p-4">
          <label
            htmlFor="ogMint"
            className="text-gray-300 font-medium shrink-0"
          >
            Token Mint:
          </label>
          <input
            type="text"
            id="ogMint"
            value={ogTestMint}
            onChange={(e) => setOgTestMint(e.target.value)}
            placeholder="Enter token mint address..."
            className="flex-grow bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00FF04]"
          />
          <Button
            onClick={handleOgTestGenerate}
            disabled={ogIsLoading}
            className="shrink-0"
            variant="secondary" // Or your preferred style
          >
            {ogIsLoading ? "Loading..." : "Preview OG Image"}
          </Button>
          {/* Add Refresh Button */}
          <Button
            onClick={handleOgRefresh}
            disabled={ogIsLoading}
            className="shrink-0"
            variant="secondary" // Or your preferred style
          >
            {ogIsLoading ? "Refreshing..." : "Refresh Preview"}
          </Button>
        </div>

        {/* Preview Area */}
        <div className="mt-6 p-4 bg-gray-800 border border-gray-700 min-h-[315px] flex items-center justify-center">
          {ogPreviewUrl && (
            <img
              ref={imageRef}
              key={ogPreviewUrl} // Force re-render when URL changes
              src={ogPreviewUrl}
              alt={`OG Preview for ${ogTestMint}`}
              className="max-w-full h-auto border border-gray-600"
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{ width: "600px", height: "315px" }} // Standard OG aspect ratio
            />
          )}
          {ogIsLoading && !ogPreviewUrl && (
            <p className="text-gray-400">Loading preview...</p>
          )}
          {!ogIsLoading && !ogPreviewUrl && !ogError && (
            <p className="text-gray-500">Enter a mint and click preview.</p>
          )}
          {ogError && <p className="text-red-400">Error: {ogError}</p>}
        </div>
      </div>
      {/* --- End OG Image Test Section --- */}
    </div>
  );
}
