"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AutoConnectContext } from "@/components/providers";
import { useUserStore } from "@/components/providers/UserProvider";
import { usePathname, useRouter } from "next/navigation";
import { Header, Payload, SIWS } from "@web3auth/sign-in-with-solana";
import { womboApi } from "@/utils/fetch";
import { z } from "zod";
import { toast } from "react-toastify";
import bs58 from "bs58";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

export const useWalletConnection = () => {
  const { publicKey } = useWallet();
  const { setAutoConnect } = useContext(AutoConnectContext);

  const connectWallet = async () => {
    try {
      localStorage.setItem("walletAutoConnect", "true");
      setAutoConnect(true);
    } catch (error) {
      console.error(error);
    }
  };

  const disconnectWallet = () => {
    localStorage.removeItem("walletAutoConnect");
    setAutoConnect(false);
  };

  return {
    connectWallet,
    disconnectWallet,
    publicKey,
  };
};

export const WalletButton = () => {
  const { disconnect, publicKey, connected, signMessage } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const { setAutoConnect } = useContext(AutoConnectContext);
  const setAuthenticated = useUserStore((state) => state.setAuthenticated);
  const authenticated = useUserStore((state) => state.authenticated);

  const pendingAuthentication = useRef(false);
  const wasConnected = useRef(false);

  const createSolanaMessage = useCallback(async () => {
    const payload = new Payload();
    payload.domain = window.location.host;
    payload.address = publicKey!.toString();
    payload.uri = window.location.origin;
    payload.statement = "Sign in with Solana to the app.";
    payload.version = "1";
    payload.chainId = 1;
    payload.nonce = (
      await womboApi.post({
        endpoint: "/generate-nonce",
        schema: z.object({
          nonce: z.string(),
        }),
      })
    ).nonce;

    const message = new SIWS({ payload });
    const messageText = message.prepareMessage();
    const messageEncoded = new TextEncoder().encode(messageText);
    const resp = await signMessage!(messageEncoded);
    const sign = bs58.encode(resp);

    return { message, sign };
  }, [publicKey, signMessage]);

  const authenticate = useCallback(async (siwsMessage: SIWS, sign: string) => {
    const signature = {
      t: "sip99",
      s: sign,
    };
    const payload = siwsMessage.payload;
    const response = await siwsMessage.verify({
      payload,
      signature,
    });
    if (response.success === true) {
      toast.success("Signature Verified");
    } else {
      toast.error(response.error?.type || "An Error Occurred");
    }

    const header = new Header();
    header.t = "sip99";
    await womboApi.post({
      endpoint: "/authenticate",
      body: { signature, payload, header },
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.setItem("walletAutoConnect", "false");
      setAutoConnect(false);
      setAuthenticated(false);
      wasConnected.current = false;
      if (connected) {
        await disconnect();
      }
      await womboApi.post({
        endpoint: "/logout",
      });
    } catch (err) {
      console.error(err);
    }

    if (pathname !== "/") {
      router.push("/");
    }
  }, [
    connected,
    disconnect,
    pathname,
    router,
    setAuthenticated,
    setAutoConnect,
  ]);

  const signIn = useCallback(async () => {
    pendingAuthentication.current = true;
    try {
      const { authenticated } = await womboApi.get({
        endpoint: "/auth-status",
        schema: z.object({ authenticated: z.boolean() }),
      });
      if (authenticated) {
        setAuthenticated(true);
        localStorage.setItem("walletAutoConnect", "true");
        setAutoConnect(true);
        return;
      }

      const { message, sign } = await createSolanaMessage();
      await authenticate(message, sign);
      setAuthenticated(true);
      localStorage.setItem("walletAutoConnect", "true");
      setAutoConnect(true);
    } catch (error) {
      await signOut();
      console.error(error);
    } finally {
      pendingAuthentication.current = false;
    }
  }, [
    authenticate,
    createSolanaMessage,
    setAuthenticated,
    setAutoConnect,
    signOut,
  ]);

  useEffect(() => {
    if (connected) {
      wasConnected.current = true;
    }
    // NOTE: to also account for disconnections from interactions not through the webapp
    if (!connected && wasConnected.current) {
      signOut();
      return;
    }

    if (connected && !authenticated && !pendingAuthentication.current) {
      // once we've connected we have access to the publicKey and can run this to sign in
      signIn();
    }
  }, [connected, signIn, signOut, authenticated]);

  return <WalletMultiButton />;
};
