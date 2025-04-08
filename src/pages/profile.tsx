import { useMemo, useState } from "react";
import { useProfile } from "../utils/profileUtils";
import { TokenTable } from "../components/token-table";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "../utils/env";
import Loader from "@/components/loader";
import Button from "@/components/button";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";

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
        <div className="text-[#8c8c8c] text-base font-normal leading-normal truncate">
          {walletAddress}
        </div>
        <Link
          to={env.getWalletUrl(walletAddress)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="visit profile"
        >
          <ExternalLink className="text-[#8C8C8C] size-5" />
        </Link>
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
        <Button
          variant={selectedTab === "held" ? "tab" : "outline"}
          onClick={() => setSelectedTab("held")}
        >
          Coins Held
        </Button>
        <Button
          variant={selectedTab === "created" ? "tab" : "outline"}
          onClick={() => setSelectedTab("created")}
        >
          Coins Created
        </Button>
      </div>

      <TokenTable tokens={tableTokens} />
    </div>
  );
}
