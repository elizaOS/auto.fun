import { env, isDevnet } from "@/utils/env";

export const MAX_INITIAL_SOL = 1000;
export const MAX_NAME_LENGTH = 32;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_PROMPT_LENGTH = 1000;

export const CREATION_STAGES = {
  UPLOADING: {
    step: 1,
    stage: "uploading" as const,
    message: "Uploading image...",
  },
  CREATING: {
    step: 2,
    stage: "creating" as const,
    message: "Creating token...",
  },
  FINALIZING: {
    step: 3,
    stage: "finalizing" as const,
    message: "Finalizing token creation...",
  },
  COMPLETE: {
    step: 4,
    stage: "complete" as const,
    message: "Token created successfully!",
  },
};

export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: "Please connect your wallet to continue",
  INVALID_FORM: "Please fill in all required fields correctly",
  UPLOAD_FAILED: "Failed to upload image. Please try again",
  CREATION_FAILED: "Failed to create token. Please try again",
  INVALID_ADDRESS: "Invalid address provided",
  INSUFFICIENT_BALANCE: "Insufficient balance for token creation",
  NETWORK_ERROR: "Network error. Please check your connection",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again",
};

export const TOKEN_SUPPLY = Number(env.tokenSupply) || 1000000000;
export const VIRTUAL_RESERVES = Number(env.virtualReserves) || 100;

export const TAB_STATE_KEY = "auto_fun_active_tab";
export const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
