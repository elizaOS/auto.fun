"use client";

import { TokenMetadata } from "./TokenMetadata";
// import { TokenGraph } from "./TokenGraph";
import { TokenMarketCap } from "./TokenMarketCap";
import { TokenBuySell } from "./swap/TokenBuySell";
import { BottomTable } from "./BottomTable";
import { CONTRACT_API_URL } from "@/utils/env";
import { io } from "socket.io-client";
import { useParams } from "next/navigation";

const socket = io(CONTRACT_API_URL);

export default function TokenDetailsPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 flex flex-col gap-2">
          <TokenMetadata mint={tokenId} />
          {/* <TokenGraph /> */}
        </div>

        <div className="flex flex-col gap-2">
          <TokenMarketCap mint={tokenId} />
          <TokenBuySell tokenId={tokenId} />
        </div>
      </div>
      <BottomTable socket={socket} mint={tokenId} />
    </div>
  );
}
