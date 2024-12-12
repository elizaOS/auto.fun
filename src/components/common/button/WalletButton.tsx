"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-wallets";
import { AutoConnectContext } from "@/components/providers";
import { useOutsideClickDetection } from "@/hooks/actions/useOutsideClickDetection";
import { womboApi } from "@/utils/fetch";
import { Header, Payload, SIWS } from "@web3auth/sign-in-with-solana";
import bs58 from "bs58";
import { toast } from "react-toastify";
import { z } from "zod";
import { useRouter, usePathname } from "next/navigation";
import { useUserStore } from "@/components/providers/UserProvider";

const ConnectedWalletButton = ({
  address,
  onDisconnect,
}: {
  address: string;
  onDisconnect: () => void;
}) => {
  const concatAddress = address.slice(0, 6) + "..." + address.slice(-3);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const disconnectButtonRef = useRef<HTMLButtonElement>(null);

  useOutsideClickDetection([disconnectButtonRef], () => {
    setShowDisconnect(false);
  });

  return (
    <div className="h-11 justify-start items-center inline-flex relative">
      <div className="p-3 rounded-tl-xl rounded-bl-xl border-l border-t border-b border-[#F743F6] justify-center items-center gap-2 flex">
        <div className="w-5 h-5 relative">
          <div className="w-[13.33px] h-[13.33px] left-[3.33px] absolute">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M14.1667 6.66659V4.16659C14.1667 3.94557 14.0789 3.73361 13.9226 3.57733C13.7663 3.42105 13.5544 3.33325 13.3333 3.33325H5.00001C4.55798 3.33325 4.13406 3.50885 3.8215 3.82141C3.50894 4.13397 3.33334 4.55789 3.33334 4.99992M3.33334 4.99992C3.33334 5.44195 3.50894 5.86587 3.8215 6.17843C4.13406 6.49099 4.55798 6.66659 5.00001 6.66659H15C15.221 6.66659 15.433 6.75438 15.5893 6.91066C15.7455 7.06694 15.8333 7.2789 15.8333 7.49992V9.99992M3.33334 4.99992V14.9999C3.33334 15.4419 3.50894 15.8659 3.8215 16.1784C4.13406 16.491 4.55798 16.6666 5.00001 16.6666H15C15.221 16.6666 15.433 16.5788 15.5893 16.4225C15.7455 16.2662 15.8333 16.0543 15.8333 15.8333V13.3333"
                stroke="#F743F6"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16.6667 10V13.3333H13.3334C12.8913 13.3333 12.4674 13.1577 12.1548 12.8452C11.8423 12.5326 11.6667 12.1087 11.6667 11.6667C11.6667 11.2246 11.8423 10.8007 12.1548 10.4882C12.4674 10.1756 12.8913 10 13.3334 10H16.6667Z"
                stroke="#F743F6"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="text-[#F743F6] text-base font-medium font-['DM Mono'] leading-tight">
          {concatAddress}
        </div>
      </div>
      <button
        className="p-3 bg-[#040207] rounded-tr-xl rounded-br-xl border border-[#F743F6] justify-center items-center gap-2 flex"
        onClick={() => {
          if (!showDisconnect) {
            setShowDisconnect(true);
          }
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.16684 9.99992C9.16684 10.2209 9.25464 10.4329 9.41092 10.5892C9.5672 10.7455 9.77916 10.8333 10.0002 10.8333C10.2212 10.8333 10.4331 10.7455 10.5894 10.5892C10.7457 10.4329 10.8335 10.2209 10.8335 9.99992C10.8335 9.7789 10.7457 9.56694 10.5894 9.41066C10.4331 9.25438 10.2212 9.16659 10.0002 9.16659C9.77916 9.16659 9.5672 9.25438 9.41092 9.41066C9.25464 9.56694 9.16684 9.7789 9.16684 9.99992ZM9.16684 15.8333C9.16684 16.0543 9.25464 16.2662 9.41092 16.4225C9.5672 16.5788 9.77916 16.6666 10.0002 16.6666C10.2212 16.6666 10.4331 16.5788 10.5894 16.4225C10.7457 16.2662 10.8335 16.0543 10.8335 15.8333C10.8335 15.6122 10.7457 15.4003 10.5894 15.244C10.4331 15.0877 10.2212 14.9999 10.0002 14.9999C9.77916 14.9999 9.5672 15.0877 9.41092 15.244C9.25464 15.4003 9.16684 15.6122 9.16684 15.8333ZM9.16684 4.16659C9.16684 4.3876 9.25464 4.59956 9.41092 4.75584C9.5672 4.91212 9.77916 4.99992 10.0002 4.99992C10.2212 4.99992 10.4331 4.91212 10.5894 4.75584C10.7457 4.59956 10.8335 4.3876 10.8335 4.16659C10.8335 3.94557 10.7457 3.73361 10.5894 3.57733C10.4331 3.42105 10.2212 3.33325 10.0002 3.33325C9.77916 3.33325 9.5672 3.42105 9.41092 3.57733C9.25464 3.73361 9.16684 3.94557 9.16684 4.16659Z"
            stroke="#F743F6"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {showDisconnect && (
        <RoundedButton
          onClick={() => {
            onDisconnect();
            setShowDisconnect(false);
          }}
          color="red"
          className="absolute -bottom-[60px] p-3 z-10 right-0"
          ref={disconnectButtonRef}
          variant="outlined"
        >
          Disconnect Wallet
        </RoundedButton>
      )}
    </div>
  );
};

export const WalletButton = () => {
  const { connect, disconnect, publicKey, connected, select, signMessage } =
    useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const { setAutoConnect } = useContext(AutoConnectContext);
  const setAuthenticated = useUserStore((state) => state.setAuthenticated);
  const authenticated = useUserStore((state) => state.authenticated);

  const pendingAuthentication = useRef(false);
  const wasConnected = useRef(false);

  const buttonText = publicKey ? "Disconnect Wallet" : "Connect Wallet";

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
        return;
      }

      const { message, sign } = await createSolanaMessage();
      await authenticate(message, sign);
      setAuthenticated(true);
    } catch (error) {
      await signOut();
      console.error(error);
    } finally {
      pendingAuthentication.current = false;
    }
  }, [authenticate, createSolanaMessage, setAuthenticated, signOut]);

  const connectWallet = async () => {
    try {
      // do not remove the await, this is a promise and the typescript type is wrong
      // see https://github.com/anza-xyz/wallet-adapter/issues/743#issuecomment-2187296267
      await select(PhantomWalletName);

      await connect();

      localStorage.setItem("walletAutoConnect", "true");
      setAutoConnect(true);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    select(PhantomWalletName);
  }, [select]);

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

  return publicKey ? (
    <ConnectedWalletButton
      address={publicKey.toString()}
      onDisconnect={signOut}
    />
  ) : (
    <RoundedButton onClick={connectWallet} className="p-3">
      {buttonText}
    </RoundedButton>
  );
};
