"use client";

import { useState, useMemo, useEffect } from "react";
import { useSwap } from "./useSwap";
import { useWallet } from "@solana/wallet-adapter-react";
import { useToken } from "@/utils/tokens";
import { Toast } from "@/components/common/Toast";
import { toast } from "react-toastify";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { formatNumber } from "@/utils/number";
import { useProgram } from "@/utils/program";
import { TradeSettingsModal } from "./TradeSettingsModal";
import { useWalletModal } from "@/components/common/custom-wallet-multi";
import { SolanaIcon } from "./SolanaIcon";

interface TokenInputProps {
  type: "Sell" | "Buy";
  showPercentages?: boolean;
  value: string;
  onChange?: (value: string) => void;
  tokenSymbol: string;
  disabled?: boolean;
  dollarValue: number;
  tokenBalance: number;
  tokenImage: string;
}

const TokenInput = ({
  type,
  showPercentages = false,
  value,
  onChange,
  tokenSymbol,
  disabled = false,
  dollarValue,
  tokenBalance,
  tokenImage,
}: TokenInputProps) => {
  // Format only for display, not for the input value itself
  const displayValue = disabled
    ? value === ""
      ? "0"
      : type === "Buy"
        ? formatNumber(parseFloat(value))
        : parseFloat(value).toFixed(4)
    : value;

  const handlePercentageClick = (percent: string) => {
    if (!onChange) return;

    if (percent === "MAX") {
      onChange(tokenBalance.toString());
    } else {
      const percentage = Number(percent.replace("%", "")) / 100;
      onChange((tokenBalance * percentage).toFixed(4));
    }
  };

  return (
    <div className="p-3.5 bg-[#212121] rounded-lg shadow-[inset_-4px_-4px_0px_0px_rgba(9,47,14,1.00)] border border-neutral-800">
      <div className="flex flex-col gap-[18px]">
        <div className="flex justify-between items-center gap-8 whitespace-nowrap">
          <div className="text-white text-base font-medium font-['DM Mono']">
            {type}
          </div>
          {showPercentages && (
            <div className="flex gap-2.5">
              {["MAX", "50%", "25%"].map((percent) => (
                <button
                  key={percent}
                  onClick={() => handlePercentageClick(percent)}
                  className="px-6 py-0.5 bg-neutral-900 rounded-md border border-neutral-800"
                >
                  <span className="text-white text-sm font-normal font-['DM Mono']">
                    {percent}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between w-full pr-[2px] text-4xl">
          <input
            type="text"
            placeholder="0"
            className="w-[120px] font-normal font-['DM Mono'] bg-transparent outline-none placeholder:text-[#a1a1a1] text-[#a1a1a1]"
            value={displayValue}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
          />
          <div className="p-2 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center gap-2">
            <div className="flex items-center gap-2">
              {tokenSymbol === "SOL" ? (
                <SolanaIcon />
              ) : (
                <img
                  src={tokenImage}
                  alt={tokenSymbol}
                  className="w-6 h-6 rounded-2xl"
                />
              )}

              <span className="text-white text-base font-normal font-['DM Mono'] uppercase tracking-widest">
                {tokenSymbol}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-start w-full">
          <span className="text-[#a1a1a1] text-sm font-normal font-['DM Mono']">
            ${dollarValue.toFixed(2)}
          </span>
          <div className="flex gap-1 items-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.25001 4.875V4.875C2.25001 3.83947 3.08947 3 4.12501 3L14.4643 3C14.4974 3 14.514 3 14.528 3.00079C14.7821 3.01506 14.9849 3.21789 14.9992 3.47196C15 3.48597 15 3.50255 15 3.53571V3.53571C15 3.73469 15 3.83417 14.9953 3.91821C14.9097 5.44269 13.6927 6.65967 12.1682 6.74528C12.0842 6.75 11.9847 6.75 11.7857 6.75H11.25M2.25001 4.875V4.875C2.25001 5.91053 3.08947 6.75 4.12501 6.75L13.75 6.75C14.6928 6.75 15.1642 6.75 15.4571 7.04289C15.75 7.33579 15.75 7.80719 15.75 8.75L15.75 9.75M2.25001 4.875L2.25001 11.75C2.25001 13.6356 2.25001 14.5784 2.83579 15.1642C3.42158 15.75 4.36439 15.75 6.25001 15.75L13.75 15.75C14.6928 15.75 15.1642 15.75 15.4571 15.4571C15.75 15.1642 15.75 14.6928 15.75 13.75L15.75 12.75M15.75 12.75H12.75C12.2841 12.75 12.0511 12.75 11.8673 12.6739C11.6223 12.5724 11.4276 12.3777 11.3261 12.1327C11.25 11.9489 11.25 11.7159 11.25 11.25V11.25C11.25 10.7841 11.25 10.5511 11.3261 10.3673C11.4276 10.1223 11.6223 9.92761 11.8673 9.82612C12.0511 9.75 12.2841 9.75 12.75 9.75H15.75M15.75 12.75L15.75 9.75"
                stroke="#A1A1A1"
              />
            </svg>

            <span className="text-[#a6a6a6] text-xs font-normal font-['DM Mono']">
              {tokenSymbol === "SOL"
                ? tokenBalance.toFixed(4)
                : formatNumber(tokenBalance)}{" "}
              {tokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TokenBuySell = ({ tokenId }: { tokenId: string }) => {
  const { data: token } = useToken({
    variables: tokenId,
    // update price data on interval. can maybe move this to the socket connection
    refetchInterval: 5000,
  });
  const program = useProgram();

  const [amountInput, setAmountInput] = useState<string>("");
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();
  const { handleSwap } = useSwap();
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isBuyMode, setIsBuyMode] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Get SOL balance
  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchSolBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
      }
    };

    fetchSolBalance();
    const id = connection.onAccountChange(publicKey, () => {
      fetchSolBalance();
    });
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection]);

  // Get token balance
  useEffect(() => {
    if (!publicKey || !connection || !program) return;

    const fetchTokenBalance = async () => {
      try {
        const tokenMint = new PublicKey(tokenId);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: tokenMint },
        );

        const balance =
          tokenAccounts.value.length > 0
            ? tokenAccounts.value[0].account.data.parsed.info.tokenAmount
                .uiAmount
            : 0;

        setTokenBalance(balance);
      } catch (error) {
        console.error("Error fetching token balance:", error);
      }
    };

    fetchTokenBalance();
    // Listen for token account changes
    const tokenAccountListener = connection.onProgramAccountChange(
      program.programId,
      fetchTokenBalance,
    );

    return () => {
      connection.removeProgramAccountChangeListener(tokenAccountListener);
    };
  }, [publicKey, connection, tokenId, program]);

  const calculatedAmounts = useMemo(() => {
    const amount =
      amountInput === "" || amountInput === "." ? 0 : parseFloat(amountInput);
    if (!token || isNaN(amount)) {
      return { dollarValue: 0, tokenAmount: 0 };
    }

    let dollarValue: number;
    let outputAmount: number;

    if (isBuyMode) {
      dollarValue = amount * token.solPriceUSD;
      outputAmount = amount / token.currentPrice;
    } else {
      dollarValue = amount * token.currentPrice * token.solPriceUSD;
      outputAmount = amount * token.currentPrice;
    }

    return {
      dollarValue,
      tokenAmount: outputAmount,
    };
  }, [amountInput, token, isBuyMode]);

  if (!token) return null;

  const handleSwapClick = async () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount === 0) return;

    try {
      await handleSwap({
        amount,
        style: isBuyMode ? "buy" : "sell",
        tokenAddress: tokenId,
      });
      toast(
        <Toast
          message={`${isBuyMode ? "Purchase" : "Sale"} of $${token.ticker}`}
          status="completed"
        />,
      );
    } catch {
      toast(
        <Toast
          message={`${isBuyMode ? "Purchase" : "Sale"} of $${token.ticker}`}
          status="failed"
        />,
      );
    }
  };

  const handleAmountChange = (value: string) => {
    // Only allow numbers and a single decimal point
    if (value === "" || value === "." || /^\d*\.?\d*$/.test(value)) {
      setAmountInput(value);
    }
  };

  const handleModeSwitch = () => {
    // Use the calculated amount directly without formatting
    setAmountInput(calculatedAmounts.tokenAmount.toString());
    setIsBuyMode(!isBuyMode);
  };

  return (
    <div className="bg-neutral-900 rounded-xl flex flex-col min-w-fit">
      <TradeSettingsModal
        modalOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      <div className="px-7 pt-8 pb-6 flex justify-between items-center border-l border-r border-t border-neutral-800 rounded-t-xl">
        <h2 className="text-green-500 text-2xl font-medium font-['DM Mono']">
          TRADE
        </h2>
        <button onClick={() => setSettingsModalOpen(true)}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.9999 15.5999C11.5271 15.5999 11.059 15.5068 10.6222 15.3258C10.1855 15.1449 9.7886 14.8797 9.45431 14.5455C9.12002 14.2112 8.85485 13.8143 8.67393 13.3775C8.49302 12.9408 8.3999 12.4726 8.3999 11.9999C8.3999 11.5271 8.49302 11.059 8.67393 10.6222C8.85485 10.1855 9.12002 9.7886 9.45431 9.45431C9.7886 9.12002 10.1855 8.85485 10.6222 8.67393C11.059 8.49302 11.5271 8.3999 11.9999 8.3999C12.9547 8.3999 13.8703 8.77918 14.5455 9.45431C15.2206 10.1294 15.5999 11.0451 15.5999 11.9999C15.5999 12.9547 15.2206 13.8703 14.5455 14.5455C13.8703 15.2206 12.9547 15.5999 11.9999 15.5999ZM11.9999 14.3999C12.6364 14.3999 13.2468 14.147 13.6969 13.6969C14.147 13.2468 14.3999 12.6364 14.3999 11.9999C14.3999 11.3634 14.147 10.7529 13.6969 10.3028C13.2468 9.85275 12.6364 9.5999 11.9999 9.5999C11.3634 9.5999 10.7529 9.85275 10.3028 10.3028C9.85275 10.7529 9.5999 11.3634 9.5999 11.9999C9.5999 12.6364 9.85275 13.2468 10.3028 13.6969C10.7529 14.147 11.3634 14.3999 11.9999 14.3999Z"
              fill="#A1A1A1"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M1.20605 14.3999C1.04729 14.4002 0.890028 14.3692 0.743331 14.3084C0.596634 14.2477 0.4634 14.1586 0.351302 14.0461C0.239205 13.9337 0.150459 13.8002 0.0901773 13.6533C0.0298954 13.5065 -0.000731626 13.3491 6.01518e-05 13.1903V10.8095C-0.00152823 10.6511 0.0283554 10.4938 0.0879789 10.347C0.147602 10.2002 0.23578 10.0666 0.3474 9.9541C0.45902 9.84158 0.591863 9.75235 0.738227 9.69155C0.884592 9.63076 1.04157 9.59963 1.20005 9.59995H2.70245C2.9246 8.73155 3.26926 7.89921 3.72604 7.12796L2.62325 6.01797C2.19605 5.54157 2.20565 4.81798 2.65925 4.36318L4.36324 2.65919C4.47526 2.54798 4.60812 2.45998 4.7542 2.4002C4.90029 2.34042 5.05674 2.31006 5.21458 2.31084C5.37242 2.31162 5.52855 2.34353 5.67404 2.40475C5.81953 2.46596 5.95151 2.55528 6.06243 2.66759L7.12922 3.72598C7.90081 3.27102 8.73255 2.92685 9.60001 2.70359V1.19999C9.60001 0.583197 10.152 0 10.8 0H13.2C13.8684 0 14.4 0.527997 14.4 1.19999V2.70359C15.2679 2.92674 16.1 3.27092 16.872 3.72598L17.9376 2.66759C18.0486 2.55536 18.1806 2.46614 18.3261 2.40502C18.4717 2.34391 18.6278 2.31211 18.7857 2.31144C18.9435 2.31077 19.0999 2.34125 19.246 2.40113C19.392 2.461 19.5248 2.54911 19.6368 2.66039L21.3408 4.36438C21.5575 4.58273 21.6819 4.87604 21.6884 5.18362C21.6949 5.49119 21.5829 5.78949 21.3756 6.01677C21.3756 6.01677 20.8956 6.50397 20.274 7.12796C20.7307 7.89921 21.0754 8.73155 21.2976 9.59995H22.7999C23.4683 9.59995 23.9999 10.1363 23.9999 10.8095V13.1903C24.0015 13.3488 23.9716 13.506 23.912 13.6529C23.8524 13.7997 23.7642 13.9333 23.6526 14.0458C23.541 14.1583 23.4081 14.2475 23.2618 14.3083C23.1154 14.3691 22.9584 14.4003 22.7999 14.3999H21.2976C21.0754 15.2683 20.7307 16.1007 20.274 16.8719L21.3324 17.9375C21.4446 18.0485 21.5338 18.1805 21.5949 18.3261C21.656 18.4716 21.6878 18.6278 21.6885 18.7856C21.6892 18.9435 21.6587 19.0999 21.5988 19.2459C21.5389 19.392 21.4508 19.5248 21.3396 19.6367L19.6356 21.3407C19.5236 21.4517 19.3908 21.5396 19.2448 21.5992C19.0988 21.6589 18.9425 21.6892 18.7848 21.6884C18.6271 21.6877 18.4711 21.6558 18.3258 21.5947C18.1804 21.5336 18.0485 21.4444 17.9376 21.3323L16.8708 20.2739C16.0992 20.7289 15.2674 21.073 14.4 21.2963V22.7939C14.4 23.4659 13.86 23.9999 13.1904 23.9999H10.8096C10.6509 24.0005 10.4936 23.9698 10.3468 23.9094C10.2 23.8491 10.0666 23.7603 9.95416 23.6483C9.84176 23.5362 9.75261 23.403 9.69183 23.2564C9.63106 23.1098 9.59985 22.9526 9.60001 22.7939V21.2963C8.73214 21.0731 7.89998 20.729 7.12802 20.2739L6.06243 21.3323C5.95143 21.4445 5.81939 21.5337 5.67386 21.5949C5.52833 21.656 5.37217 21.6878 5.21433 21.6884C5.05649 21.6891 4.90006 21.6586 4.75402 21.5988C4.60798 21.5389 4.47518 21.4508 4.36324 21.3395L2.65925 19.6355C2.54823 19.5235 2.46037 19.3907 2.4007 19.2447C2.34103 19.0988 2.31072 18.9425 2.3115 18.7848C2.31228 18.6271 2.34413 18.4711 2.40525 18.3257C2.46636 18.1803 2.55552 18.0484 2.66765 17.9375L3.72604 16.8719C3.26926 16.1007 2.9246 15.2683 2.70245 14.3999H1.20605ZM5.25963 6.96837L4.98724 7.37636C4.39368 8.26915 3.97958 9.26894 3.76804 10.3199L3.66964 10.7999H1.20605C1.20245 10.7999 1.20005 11.5967 1.20005 13.1903C1.20005 13.1963 2.02325 13.1999 3.66964 13.1999L3.76804 13.6799C3.98404 14.7395 4.39204 15.7319 4.98724 16.6235L5.25963 17.0315L3.51964 18.7835C3.51484 18.7871 4.07884 19.3559 5.21163 20.4899L6.96843 18.7403L7.37642 19.0127C8.27064 19.6044 9.27044 20.0183 10.3212 20.2319L10.8 20.3315V22.7939C10.8 22.7975 11.5968 22.7999 13.1904 22.7999C13.1964 22.7999 13.2 21.9767 13.2 20.3315L13.6788 20.2319C14.7296 20.0183 15.7294 19.6044 16.6236 19.0127L17.0316 18.7403L18.7836 20.4803C18.7872 20.4851 19.356 19.9211 20.49 18.7883L18.7404 17.0315L19.0128 16.6235C19.6063 15.7307 20.0204 14.7309 20.232 13.6799L20.3304 13.1999H22.7939C22.7975 13.1999 22.7999 12.4031 22.7999 10.8095C22.7999 10.8035 21.9767 10.7999 20.3304 10.7999L20.232 10.3199C20.0204 9.26894 19.6063 8.26915 19.0128 7.37636L18.7404 6.96837L20.3916 5.30757L20.4888 5.20917L18.7896 3.50998L17.0316 5.25957L16.6236 4.98717C15.7294 4.39549 14.7296 3.98155 13.6788 3.76798L13.2 3.66838V1.19999C13.2 1.19639 12.4032 1.19639 10.8096 1.19999C10.8036 1.19999 10.8 2.02319 10.8 3.66838L10.3212 3.76798C9.27044 3.98155 8.27064 4.39549 7.37642 4.98717L6.96843 5.25957L5.21643 3.51958C5.21283 3.51478 4.64404 4.07878 3.51124 5.20917L5.25963 6.96837Z"
              fill="#A1A1A1"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 px-7 pb-[34px] flex flex-col justify-center gap-6 border-l border-r border-b border-neutral-800 rounded-b-xl min-w-fit">
        <div className="flex flex-col gap-2.5 relative min-w-fit">
          <TokenInput
            type="Sell"
            showPercentages={!isBuyMode}
            value={amountInput}
            onChange={handleAmountChange}
            tokenSymbol={isBuyMode ? "SOL" : token.ticker}
            disabled={false}
            dollarValue={calculatedAmounts.dollarValue}
            tokenBalance={isBuyMode ? solBalance : tokenBalance}
            tokenImage={token.image}
          />

          <button
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-[#212121] rounded-full border-2 border-neutral-900 flex justify-center z-10"
            onClick={handleModeSwitch}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 16L8 19M8 19L5 16M8 19V5M13 8L16 5M16 5L19 8M16 5V19"
                stroke="white"
                strokeWidth="1.41176"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <TokenInput
            type="Buy"
            showPercentages={false}
            value={calculatedAmounts.tokenAmount.toString()}
            onChange={undefined}
            tokenSymbol={isBuyMode ? token.ticker : "SOL"}
            disabled={true}
            dollarValue={calculatedAmounts.dollarValue}
            tokenBalance={isBuyMode ? tokenBalance : solBalance}
            tokenImage={token.image}
          />
        </div>

        <div className="w-full h-10">
          <button
            className="w-full h-10 bg-green-500 relative flex items-center justify-center"
            style={{
              clipPath:
                "polygon(0% 72%, 0% 0%, 95% 0%, 100% 29%, 100% 100%, 5% 100%)",
            }}
            onClick={
              publicKey ? handleSwapClick : () => setWalletModalVisible(true)
            }
          >
            <span className="text-black text-xl font-['DM Mono']">
              {publicKey ? "SWAP" : "CONNECT WALLET"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
