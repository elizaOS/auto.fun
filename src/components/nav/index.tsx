"use client";

import Link from "next/link";
import Image from "next/image";
import { WalletButton } from "../common/button/WalletButton";
import { RoundedButton } from "../common/button/RoundedButton";
import { useUserStore } from "../providers/UserProvider";
import { useRef, useState } from "react";
import { Modal } from "../common/Modal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useSearchTokens } from "@/utils/tokens";
import { formatNumber } from "@/utils/number";
import { useOutsideClickDetection } from "@/hooks/actions/useOutsideClickDetection";

const AgentSearchResult = ({
  name,
  symbol,
  id,
  marketCap,
  imageUrl,
  onClick,
}: {
  name: string;
  symbol: string;
  id: string;
  marketCap: number;
  imageUrl: string;
  onClick: () => void;
}) => {
  return (
    <Link
      href={`/coin/${id}`}
      className="self-stretch bg-neutral-900 flex items-center gap-6 p-2 hover:bg-[#262626] rounded-md"
      onClick={onClick}
    >
      <img className="w-10 h-10 rounded-lg" src={imageUrl} alt={name} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="text-white text-sm font-medium font-['DM Mono'] leading-tight">
            {name}
          </div>
          <div className="text-[#a6a6a6] text-xs font-normal font-['DM Mono'] uppercase leading-none tracking-widest">
            ${symbol}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[#a6a6a6] text-xs font-normal font-['DM Mono'] leading-tight">
            {id.slice(0, 3)}...{id.slice(-3)}
          </div>
          <div className="w-4 h-4 relative overflow-hidden" />
        </div>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <div className="text-[#03ff24] text-xs font-normal font-['DM Mono'] leading-tight">
          MC:
        </div>
        <div className="text-[#03ff24] text-xs font-normal font-['DM Mono'] leading-tight">
          {formatNumber(marketCap, 0)}
        </div>
      </div>
    </Link>
  );
};

const AgentSearch = () => {
  const [searchInput, setSearchInput] = useState("");
  const { mutateAsync: searchTokens } = useSearchTokens();
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Awaited<ReturnType<typeof searchTokens>>["tokens"]
  >([]);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetection([ref], () => {
    setShowSearchResults(false);
    setSearchResults([]);
  });

  const handleSearch = async (searchQuery: string) => {
    console.log("Searching for:", searchQuery);
    const { tokens } = await searchTokens(searchQuery);
    setSearchResults(tokens);
    setShowSearchResults(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const trimmedInput = searchInput.trim();
    if (e.key === "Enter" && trimmedInput.length > 0) {
      handleSearch(trimmedInput);
    }
  };

  return (
    <div className="relative flex-1 max-w-[500px]">
      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder="Symbol or Address..."
        className="w-full h-11 pl-10 pr-3 rounded-lg border border-[#d1d1d1] bg-transparent text-[#d1d1d1] text-sm placeholder:text-sm leading-tight focus:outline-none"
      />
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 17L12.3333 12.3333M13.8889 8.44444C13.8889 11.4513 11.4513 13.8889 8.44444 13.8889C5.43756 13.8889 3 11.4513 3 8.44444C3 5.43756 5.43756 3 8.44444 3C11.4513 3 13.8889 5.43756 13.8889 8.44444Z"
          stroke="#D1D1D1"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showSearchResults && (
        <div
          className="w-full min-w-[264px] p-3.5 bg-neutral-900 rounded-lg border border-neutral-800 flex flex-col gap-6 absolute mt-4"
          ref={ref}
        >
          <div className="text-[#03ff24] text-xs font-normal font-['DM Mono'] uppercase leading-none tracking-widest">
            Agents
          </div>
          {searchResults.map((token) => (
            <AgentSearchResult
              key={token.mint}
              id={token.mint}
              marketCap={token.marketCapUSD}
              name={token.name}
              symbol={token.ticker}
              imageUrl={token.image}
              onClick={() => setShowSearchResults(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Step = ({
  number,
  description,
}: {
  number: number;
  description: string;
}) => (
  <div className="py-4">
    <span className="text-white font-mono font-medium text-xl">
      Step {number}:{" "}
    </span>
    <span className="text-[#A1A1A1] font-mono text-base">{description}</span>
  </div>
);

export const Nav = () => {
  const authenticated = useUserStore((state) => state.authenticated);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <nav className="flex justify-between items-center fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-[#0e0e0e] border-b border-b-[#03ff24]/40 gap-10">
      <div className="flex gap-6 items-center">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image
              height={40}
              width={40}
              src="/logo_rounded_25percent.png"
              alt="logo"
            />
          </Link>
        </div>
        <div className="flex hidden md:flex gap-6 items-center">
          <Link href="/create">
            <RoundedButton variant="outlined" className="p-3 px-4 border-none">
              Create token
            </RoundedButton>
          </Link>
          {authenticated && (
            <Link href={`/my-agents`}>
              <RoundedButton
                className="p-3 font-medium border-none"
                variant="outlined"
              >
                My tokens
              </RoundedButton>
            </Link>
          )}
        </div>
      </div>
      <div className="hidden md:flex gap-6 items-center justify-end flex-1">
        <AgentSearch />
        <button
          className="text-center text-[#d1d1d1] text-base font-medium leading-normal py-3 px-4"
          onClick={() => setModalOpen(true)}
        >
          How it works?
        </button>
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="How it works"
          maxWidth={587}
          className="bg-[#171717]"
        >
          <div className="flex flex-col p-[14px]">
            <p className="text-[#A6A6A6] text-sm font-mono leading-5 mt-1.5 mb-6">
              auto.fun ensures that all created tokens are safe to trade through
              a secure and battle-tested token launching system. Each coin on
              auto.fun is a fair-launch with no presale and no team allocation.
            </p>

            <div className="flex flex-col divide-y divide-[#505050]/30 border-y border-[#505050]/30">
              <Step number={1} description="Pick a coin that you like" />
              <Step
                number={2}
                description="Buy the coin on the bonding curve"
              />
              <Step
                number={3}
                description="Sell at any time to lock in your profits or losses"
              />
              <Step
                number={4}
                description="When enough people buy on the bonding curve, it reaches a market cap of $100k"
              />
              <Step
                number={5}
                description="$17k of liquidity is then deposited in Raydium and burned"
              />
            </div>

            <div className="flex flex-col gap-[34px] items-center">
              <button
                className="w-full py-2 px-5 mt-[34px] bg-[#092F0E] rounded-lg text-[#03FF24] font-mono font-medium"
                onClick={() => setModalOpen(false)}
              >
                Continue
              </button>

              <p className="text-center text-[#A6A6A6] font-mono font-medium px-4">
                By clicking this button you agree to the terms and conditions.
              </p>

              <div className="flex items-center gap-3">
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Privacy Policy
                </a>
                <div className="h-6 w-px bg-[#505050]" />
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Terms of Service
                </a>
                <div className="h-6 w-px bg-[#505050]" />
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Fees
                </a>
              </div>
            </div>
          </div>
        </Modal>
        <WalletButton />
      </div>
      <div className="flex md:hidden items-center">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button className="text-[#d1d1d1] outline-solid">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#0e0e0e] border-b border-b-[#03ff24]/40 gap-1 flex flex-col py-6 px-4 mr-4">
            <DropdownMenuItem asChild>
              <Link href="/create" className="text-[#d1d1d1]">
                Create Agent
              </Link>
            </DropdownMenuItem>
            {authenticated && (
              <DropdownMenuItem asChild>
                <Link href={`/my-agents`} className="text-[#d1d1d1]">
                  My Agents
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <button
                className="text-center text-[#d1d1d1]"
                onClick={() => setModalOpen(true)}
              >
                How it works?
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <WalletButton />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};
