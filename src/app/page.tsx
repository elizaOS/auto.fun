"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";
import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const [isPhantomInstalled, setIsPhantomInstalled] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const { status } = useSession();

  useEffect(() => {
    if (typeof window !== "undefined" && window.solana?.isPhantom) {
      setIsPhantomInstalled(true);
    }
  }, []);

  const connectWallet = async () => {
    const phantomResponse = await window.solana.connect();
    setPublicKey(phantomResponse.publicKey.toString());
  };

  const signMessage = async () => {
    try {
      const message = "Sign this message to authenticate with our app.";
      const encodedMessage = new TextEncoder().encode(message);
      const signedMessage = await window.solana.signMessage(encodedMessage);
      const signature = bs58.encode(signedMessage.signature);

      // Send signature, publicKey, and message to your backend for verification
      console.log(publicKey, message, signature);
    } catch (err) {
      console.error("Failed to sign message", err);
    }
  };

  if (!isPhantomInstalled) {
    return (
      <div>
        <h1>Phantom Wallet not installed</h1>
        <a href="https://phantom.app/download">Install Phantom Wallet</a>
      </div>
    );
  }

  if (!publicKey) {
    return (
      <div>
        <button onClick={connectWallet}>Connect wallet</button>
        {status === "authenticated" ? (
          <button onClick={() => signOut()}>Clear Session</button>
        ) : (
          <button onClick={() => signIn()}>Authenticate</button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button onClick={signMessage}>Sign message</button>
    </div>
  );
}
