
"use client";
import Link from "next/link";
import Image from "next/image";
import { WalletButton } from "../common/button/WalletButton";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { RoundedButton } from "../common/button/RoundedButton";
import { useUserStore } from "../providers/UserProvider";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "../common/Modal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Token, useSearchTokens } from "@/utils/tokens";
import { formatNumber } from "@/utils/number";
import { useOutsideClickDetection } from "@/hooks/actions/useOutsideClickDetection";
import { debounce } from "lodash";

const CopyButton = ({ text }: { text: string }) => {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={(event) => {
        navigator.clipboard.writeText(text);
        event.preventDefault();
        event.stopPropagation();
      }}
      className="cursor-pointer"
    >
      <g clipPath="url(#clip0_726_6190)">
        <path
          d="M15 6.75H8.25C7.42157 6.75 6.75 7.42157 6.75 8.25V15C6.75 15.8284 7.42157 16.5 8.25 16.5H15C15.8284 16.5 16.5 15.8284 16.5 15V8.25C16.5 7.42157 15.8284 6.75 15 6.75Z"
          stroke="#03FF24"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.75 11.25H3C2.60218 11.25 2.22064 11.092 1.93934 10.8107C1.65804 10.5294 1.5 10.1478 1.5 9.75V3C1.5 2.60218 1.65804 2.22064 1.93934 1.93934C2.22064 1.65804 2.60218 1.5 3 1.5H9.75C10.1478 1.5 10.5294 1.65804 10.8107 1.93934C11.092 2.22064 11.25 2.60218 11.25 3V3.75"
          stroke="#03FF24"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_726_6190">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

const AgentSearchResult = ({
  name,
  symbol,
  id,
  marketCap,
  imageUrl,
  onNavigate,
}: {
  name: string;
  symbol: string;
  id: string;
  marketCap: number;
  imageUrl: string;
  onNavigate: () => void;
}) => {
  return (
    <Link href={`/coin/${id}`} onClick={onNavigate}>
      <div className="flex items-center gap-4 p-2 hover:bg-[#262626] rounded-md transition-all duration-200 group cursor-pointer">
        <img
          className="w-10 h-10 rounded-lg object-cover"
          src={imageUrl}
          alt={name}
        />
        <div className="flex flex-col gap-1">
          <div className="text-white text-sm font-medium group-hover:text-[#2FD345] transition-colors">
            {name}
          </div>
          <div className="text-[#8C8C8C] text-xs uppercase tracking-widest group-hover:text-white/80 transition-colors">
            ${symbol}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[#8C8C8C] text-xs group-hover:text-white/70 transition-colors">
              {id.slice(0, 3)}...{id.slice(-3)}
            </div>
            <CopyButton text={id} />
          </div>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[#2FD345] text-xs">MC:</span>
          <span className="text-[#2FD345] text-xs">
            ${formatNumber(marketCap, 0)}
          </span>
        </div>
      </div>
    </Link>
  );
};

const SearchIcon = ({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
    >
      <path
        d="M17 17L12.3333 12.3333M13.8889 8.44444C13.8889 11.4513 11.4513 13.8889 8.44444 13.8889C5.43756 13.8889 3 11.4513 3 8.44444C3 5.43756 5.43756 3 8.44444 3C11.4513 3 13.8889 5.43756 13.8889 8.44444Z"
        stroke="#D1D1D1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const CloseIcon = ({ onClick }: { onClick: () => void }) => {
  return (
    <svg
      onClick={onClick}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_726_7142)">
        <path
          d="M3 3L15 15"
          stroke="#505050"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 15L15 3"
          stroke="#505050"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_726_7142">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

const AgentSearch = ({ isMobile }: { isMobile: boolean }) => {
  const [searchInput, setSearchInput] = useState("");
  const { mutateAsync: searchTokens } = useSearchTokens();
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSearching, setIsSearching] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClickDetection([ref], () => {
    setShowSearchResults(false);
    setSearchResults([]);
  });

  const handleSearch = useRef(
    debounce(async (query: string) => {
      if (query.trim().length === 0) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }

      try {
        setIsSearching(true);
        const { tokens } = await searchTokens(query);
        setSearchResults(tokens);
        setShowSearchResults(true);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300),
  ).current;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    handleSearch(value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const trimmedInput = searchInput.trim();
    if (e.key === "Enter" && trimmedInput.length > 0) {
      handleSearch(trimmedInput);
    }
  };

  useEffect(() => {
    return () => {
      handleSearch.cancel();
    };
  }, [handleSearch]);

  useLayoutEffect(
    function hideBodyScrollBar() {
      const { overflow } = window.getComputedStyle(document.body);

      if (showMobileSearch) {
        document.body.style.overflow = "hidden";
      }

      return () => {
        document.body.style.overflow = overflow;
      };
    },
    [showMobileSearch],
  );

  if (isMobile) {
    return (
      <div>
        <SearchIcon
          className="cursor-pointer"
          onClick={() => setShowMobileSearch(true)}
        />

        {showMobileSearch && (
          <div className="fixed inset-0 bg-neutral-900 body-padding-x flex flex-col">
            <div className="flex items-center">
              <div className="relative flex-1 py-5">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Symbol or Address..."
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-transparent text-[#d1d1d1] text-sm placeholder:text-sm leading-tight focus:outline-none"
                />
              </div>
              <CloseIcon onClick={() => setShowMobileSearch(false)} />
            </div>
            {showSearchResults && (
              <div
                className="w-full bg-neutral-900 px-4 rounded-b-lg flex flex-col flex-1 gap-6 mt-[14px] overflow-y-scroll no-scrollbar"
                ref={ref}
              >
                <div className="text-[#03ff24] text-xs font-normal uppercase leading-none tracking-widest">
                  <Link href="/">
                    Agents
                  </Link>
                </div>
                {searchResults.map((token) => (
                  <AgentSearchResult
                    key={token.mint}
                    id={token.mint}
                    marketCap={token.marketCapUSD}
                    name={token.name}
                    symbol={token.ticker}
                    imageUrl={token.image}
                    onNavigate={() => {
                      setShowSearchResults(false);
                      setShowMobileSearch(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <div className="flex items-center h-11 w-full px-2 gap-2 bg-[#171717] border border-[#262626] rounded-md hover:border-[#2FD345]/50 focus-within:border-[#2FD345]/50 transition-colors">
        <SearchIcon className="w-6 h-6 text-[#8C8C8C] group-hover:text-[#2FD345]" />
        <input
          type="text"
          value={searchInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          placeholder="Symbol or Address..."
          className="flex-1 bg-transparent text-base font-medium text-[#8C8C8C] placeholder-[#8C8C8C] focus:outline-none hover:placeholder-white focus:placeholder-white transition-colors"
        />
      </div>

      {showSearchResults && (
        <div
          className="absolute w-full p-3.5 bg-[#171717] rounded-lg border border-[#262626] flex flex-col gap-6 mt-2 max-h-[60vh] overflow-auto z-50 shadow-lg"
          ref={ref}
        >
          <div className="text-[#2FD345] text-xs font-normal uppercase leading-none tracking-widest">
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
              onNavigate={() => setShowSearchResults(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Step = ({
  number,
  title,
  isHighlighted = false
}: {
  number: number;
  title: string;
  isHighlighted?: boolean;
}) => (
  <div className="flex items-start gap-2">
    <span className={`font-mono text-xl ${isHighlighted ? 'text-white' : 'text-[#8C8C8C]'}`}>
      Step {number}:
    </span>
    <span className="font-mono text-[#8C8C8C] text-xl">
      {title}
    </span>
  </div>
);

const TabContent = ({ type }: { type: 'trading' | 'creation' }) => {
  if (type === 'trading') {
    return (
      <div className="flex flex-col p-8">
        <h2 className="text-[#2FD345] text-[32px] font-satoshi mb-4">
          Token Trading
        </h2>
        
        <p className="text-[#8C8C8C] text-base font-satoshi mb-8">
          Auto.fun streamlines agentic trading through a token launching system. Create value for projects you believe in.
        </p>

        <div className="flex flex-col gap-6">
          <Step 
            number={1} 
            title="Browse and select a token from the marketplace"
            isHighlighted={true}
          />
          <Step 
            number={2} 
            title="Buy tokens through our bonding curve mechanism"
          />
          <Step 
            number={3} 
            title="Buy and sell with instant liquidity"
          />
          <Step 
            number={4} 
            title="When the bonding curve compeltes, the token reaches a $100k market cap"
          />
          <Step 
            number={5} 
            title="Token transitions to Raydium"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-8">
      <h2 className="text-[#2FD345] text-[32px] font-satoshi mb-4">
        Token Creation
      </h2>
      
      <p className="text-[#8C8C8C] text-base font-satoshi mb-8">
        Auto.fun creates a dual-pool trading environment for sustainable AI token launches.
      </p>

      <div className="flex flex-col gap-6">
        <Step number={1} title="Configure token details & symbol" />
        <Step number={2} title="Create or link an agent if desired" />
        <Step number={3} title="Define project parameters" />
        <Step number={4} title="Set optional creator allocation" />
        <Step number={5} title="Initialize bonding curve" />
        <Step number={6} title="Trading begins in primary SOL pool" />
        <Step number={7} title="Once Token reaches $100k market cap, automatic transition to Raydium" />
      </div>
    </div>
  );
};

export const Nav = () => {
  const authenticated = useUserStore((state) => state.authenticated);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'trading' | 'creation'>('trading');

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col justify-center items-center py-6 px-[120px] h-[92px] bg-[#0A0A0A] border-b border-[#262626]">
        <div className="flex justify-between items-center w-full max-w-[1680px] h-11 gap-8">
          {/* Left section */}
          <div className="flex items-center gap-6 flex-1">
            <Link href="/" className="flex items-center">
              <Image
                height={40}
                width={40}
                src="/logo_rounded_25percent.png"
                alt="logo"
              />
            </Link>
            <div className="hidden md:flex gap-6">
              <Link href="/">
                <button className="flex items-center justify-center px-3 py-2 gap-2 h-9 rounded-md bg-transparent text-white">
                  <span className="text-base font-medium">Agents</span>
                </button>
              </Link>
              <button 
                className="flex items-center justify-center px-3 py-2 gap-2 h-9 rounded-md bg-transparent text-[#8C8C8C] hover:text-white transition-colors duration-200"
                onClick={() => setModalOpen(true)}
              >
                <span className="text-base font-normal">How It Works</span>
              </button>
              <Link href="/support">
                <button className="flex items-center justify-center px-3 py-2 gap-2 h-9 rounded-md bg-transparent text-[#8C8C8C] hover:text-white transition-colors duration-200">
                  <span className="text-base font-normal">Support</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Center section - Search */}
          <div className="flex-1 max-w-[500px] mr-6">
            <AgentSearch isMobile={false} />
          </div>

          {/* Right section */}
          <div className="flex items-center gap-4">
            <Link href="/create">
              <button className="flex items-center justify-center px-4 py-2.5 gap-2 h-11 bg-[#171717] border border-[#2FD345] rounded-md">
                <span className="text-base font-medium text-white">Create Token</span>
                <Image
                  src="/stars.svg"
                  width={24}
                  height={24}
                  alt="stars"
                  className="text-[#2FD345]"
                />
              </button>
            </Link>
            <WalletButton />
          </div>

          {/* Keep existing mobile menu code */}
          <div className="flex md:hidden items-center gap-4">
            <AgentSearch isMobile />
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
              <DropdownMenuContent className="overflow-visible bg-[#0e0e0e] border-b border-b-[#03ff24]/40 gap-1 flex flex-col py-6 px-4 mr-4">
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
        </div>
      </nav>

      {/* Modal moved outside the nav container */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title=""
        maxWidth={587}
        className="bg-[#171717] border border-[#262626] rounded-lg p-0"
        allowClose={false}
      >
        <div className="flex flex-col w-[587px]">
          {/* Tab Bar */}
          <div className="flex w-full border-b border-[#262626]">
            <button
              onClick={() => setActiveTab('trading')}
              className={`flex justify-center items-center w-[293.5px] h-[60px] font-satoshi text-xl tracking-[-0.02em] transition-all duration-200
                ${activeTab === 'trading' 
                  ? 'text-[#2FD345] bg-[#171717]' 
                  : 'text-[#8C8C8C]'}`}
            >
              Token Trading
            </button>
            <button
              onClick={() => setActiveTab('creation')}
              className={`flex justify-center items-center w-[293.5px] h-[60px] font-satoshi text-xl tracking-[-0.02em] transition-all duration-200 border-l border-[#262626]
                ${activeTab === 'creation' 
                  ? 'text-[#2FD345] bg-[#171717]' 
                  : 'text-[#8C8C8C]'}`}
            >
              Token Creation
            </button>
          </div>

          {/* Content */}
          <TabContent type={activeTab} />

          {/* Footer */}
          <div className="flex flex-col gap-4 items-center px-8 pb-6">
            <button
              className="w-full py-3 bg-[#2E2E2E] hover:bg-[#262626] rounded-lg text-white font-satoshi"
              onClick={() => setModalOpen(false)}
            >
              Continue
            </button>

            <p className="text-[#8C8C8C] font-satoshi text-sm">
              By clicking this button you agree to the terms and conditions.
            </p>

            <div className="flex items-center gap-3">
              <a href="/legal/privacy" className="text-[#8C8C8C] font-satoshi text-sm underline hover:text-white">
                Privacy Policy
              </a>
              <div className="h-4 w-px bg-[#505050]" />
              <a href="/legal/terms" className="text-[#8C8C8C] font-satoshi text-sm underline hover:text-white">
                Terms of Service
              </a>
              <div className="h-4 w-px bg-[#505050]" />
              <a href="/legal/fees" className="text-[#8C8C8C] font-satoshi text-sm underline hover:text-white">
                Fees
              </a>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
