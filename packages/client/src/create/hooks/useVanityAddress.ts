import InlineVanityWorker from "@/workers/vanityWorker?worker&inline";
import { Keypair } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { BASE58_REGEX } from "../consts";
import { VanityResult, WorkerMessage } from "../types";

export const useVanityAddress = () => {
  const [vanitySuffix, setVanitySuffix] = useState("FUN");
  const [isGeneratingVanity, setIsGeneratingVanity] = useState(false);
  const [vanityResult, setVanityResult] = useState<VanityResult | null>(null);
  const [displayedPublicKey, setDisplayedPublicKey] = useState<string>(
    "--- Generate a vanity address ---",
  );
  const [suffixError, setSuffixError] = useState<string | null>(null);

  const workersRef = useRef<Worker[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const displayUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isGeneratingVanityRef = useRef(isGeneratingVanity);

  useEffect(() => {
    isGeneratingVanityRef.current = isGeneratingVanity;
  }, [isGeneratingVanity]);

  const stopVanityGeneration = useCallback(() => {
    if (!isGeneratingVanityRef.current) return;
    setIsGeneratingVanity(false);
    workersRef.current.forEach((worker) => {
      try {
        worker.postMessage("stop");
      } catch (e) {
        console.warn("Couldn't send stop message to worker", e);
      }
      setTimeout(() => {
        try {
          worker.terminate();
        } catch (e) {
          /* ignore */
        }
      }, 100);
    });
    workersRef.current = [];
    startTimeRef.current = null;
    if (displayUpdateIntervalRef.current) {
      clearInterval(displayUpdateIntervalRef.current);
      displayUpdateIntervalRef.current = null;
    }
  }, []);

  const startVanityGeneration = useCallback(() => {
    const suffix = vanitySuffix.trim();
    setVanityResult(null);
    setDisplayedPublicKey("Generating...");

    let currentError = null;

    if (!suffix) {
      currentError = "Suffix cannot be empty.";
    } else if (suffix.length > 5) {
      currentError = "Suffix cannot be longer than 5 characters.";
    } else if (!BASE58_REGEX.test(suffix)) {
      currentError = "Suffix contains invalid Base58 characters.";
    }

    if (!currentError) {
      if (suffix.length === 5) {
        currentError = "Warning: 5-letter suffix may take 24+ hours to find!";
        toast.warn(currentError);
      } else if (suffix.length === 4) {
        currentError = "Note: 4-letter suffix may take some time to find.";
        toast.info(currentError);
      }
    }

    setSuffixError(currentError);
    if (
      currentError &&
      !currentError.startsWith("Warning") &&
      !currentError.startsWith("Note")
    ) {
      return;
    }

    stopVanityGeneration();
    setIsGeneratingVanity(true);

    const numWorkers =
      navigator.hardwareConcurrency > 12
        ? 8
        : navigator.hardwareConcurrency || 4;
    startTimeRef.current = Date.now();
    workersRef.current = [];

    const base58Chars =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const generateRandomString = (length: number) => {
      let result = "";
      for (let i = 0; i < length; i++) {
        result += base58Chars.charAt(
          Math.floor(Math.random() * base58Chars.length),
        );
      }
      return result;
    };

    displayUpdateIntervalRef.current = setInterval(() => {
      const prefixLength = 44 - suffix.length;
      const randomPrefix = generateRandomString(prefixLength);
      setDisplayedPublicKey(`${randomPrefix}${suffix}`);
    }, 100);

    for (let i = 0; i < numWorkers; i++) {
      const worker = new InlineVanityWorker();
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === "found") {
          const { publicKey, secretKey } = e.data;
          const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
          setVanityResult({ publicKey, secretKey: keypair });
          setDisplayedPublicKey(publicKey);
          stopVanityGeneration();
        }
      };
      worker.postMessage({ suffix });
      workersRef.current.push(worker);
    }
  }, [suffixError, stopVanityGeneration, vanitySuffix]);

  return {
    vanitySuffix,
    setVanitySuffix,
    isGeneratingVanity,
    vanityResult,
    displayedPublicKey,
    suffixError,
    startVanityGeneration,
    stopVanityGeneration,
  };
};
