import { PublicKey } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

interface PhantomEvent {
  connect: (publicKey: PublicKey) => void;
  disconnect: () => void;
  accountChanged: (publicKey: PublicKey | null) => void;
}

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  isConnected?: boolean;
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  on: <T extends keyof PhantomEvent>(
    event: T,
    handler: PhantomEvent[T]
  ) => void;
  request: (method: string, params: any) => Promise<any>;
  signMessage: (
    message: Uint8Array,
    display?: "hex" | "utf8"
  ) => Promise<{ signature: Uint8Array }>;
  // Add other methods if needed
}
