import { PropsWithChildren, useMemo, useState } from "react";
import { useProfile } from "../utils/profileUtils";
import { TokenTable } from "../components/token-table";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "../utils/env";
import Loader from "@/components/loader";

type TabButtonProps = PropsWithChildren<{
  isSelected: boolean;
  onClick: () => void;
}>;

const TabButton = ({ isSelected, onClick, children }: TabButtonProps) => (
  <button
    className={`px-3 py-2 border border-[#03FF24] justify-center items-center gap-2 self-start font-satoshi ${
      isSelected ? "bg-[#03FF24]" : "bg-neutral-900"
    }`}
    onClick={onClick}
  >
    <div
      className={`cursor-pointer text-right text-white text-base font-medium leading-tight ${
        isSelected ? "text-black" : "text-white"
      }`}
    >
      {children}
    </div>
  </button>
);

const ExternalLinkIcon = ({ address }: { address: string }) => {
  return (
    <a
      href={env.getWalletUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="visit profile"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M11 1.5H14.5V5M13.75 2.25L10 6M8.5 2.5H4C3.60218 2.5 3.22064 2.65804 2.93934 2.93934C2.65804 3.22064 2.5 3.60218 2.5 4V12C2.5 12.3978 2.65804 12.7794 2.93934 13.0607C3.22064 13.342 3.60218 13.5 4 13.5H12C12.3978 13.5 12.7794 13.342 13.0607 13.0607C13.342 12.7794 13.5 12.3978 13.5 12V7.5"
          stroke="#8C8C8C"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};

const WalletAddress = () => {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  if (!walletAddress) return null;

  return (
    <div className="p-4 bg-neutral-900 border border-neutral-800 mb-[28px]">
      <div className="text-white text-base font-normal uppercase leading-normal tracking-widest mb-2">
        wallet
      </div>
      <div className="px-3 py-2 bg-[#212121] border border-neutral-800 flex justify-between items-center gap-4">
        <div className="text-[#8c8c8c] text-base font-normal leading-normal">
          {walletAddress}
        </div>
        <ExternalLinkIcon address={walletAddress} />
      </div>
    </div>
  );
};

type Tab = "held" | "created";

export default function Profile() {
  const [selectedTab, setSelectedTab] = useState<Tab>("held");
  const { data: tokens, isLoading } = useProfile();
  const tableTokens = useMemo(() => {
    switch (selectedTab) {
      case "created":
        return tokens.tokensCreated;
      case "held":
        return tokens.tokensHeld;
    }
  }, [selectedTab, tokens.tokensCreated, tokens.tokensHeld]);

  if (isLoading) return <Loader />;

  return (
    <div className="flex flex-col flex-1 mt-32 max-w-4xl w-full m-auto">
      <div className="text-white text-[32px] font-medium leading-9 mb-6 font-satoshi">
        User Profile
      </div>
      <WalletAddress />
      <div className="flex gap-2.5 mb-4">
        <TabButton
          isSelected={selectedTab === "held"}
          onClick={() => setSelectedTab("held")}
        >
          Autos Held
        </TabButton>
        <TabButton
          isSelected={selectedTab === "created"}
          onClick={() => setSelectedTab("created")}
        >
          Autos Created
        </TabButton>
      </div>

      <TokenTable tokens={tableTokens} />
    </div>
  );
}
