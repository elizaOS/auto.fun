"use client";

import { TokenMetadata } from "./TokenMetadata";
import { TokenMarketCap } from "./TokenMarketCap";
import { TokenBuySell } from "./swap/TokenBuySell";
import { BottomTable } from "./BottomTable";
import { useParams } from "next/navigation";
import { useToken } from "@/utils/tokens";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { useEffect } from "react";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";

export default function TokenDetailsPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;

  const { data: token } = useToken({ variables: tokenId });

  useEffect(() => {
    if (!token) return;

    const socket = getSocket();

    console.log("subscribe", tokenId);
    socket.emit("subscribe", tokenId);

    socket.on("updateToken", (token) => {
      console.log("updateToken", token);
      queryClient.setQueryData(useToken.getKey(tokenId), token);
    });

    return () => {
      socket.off("updateToken");
    };
  }, [token, tokenId]);

  if (!token) return null;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 flex flex-col gap-2">
          <TokenMetadata mint={tokenId} />
          {/* chart will have outdated data once token is migrated */}
          {token.status === "active" && <TradingChart param={token} />}
          <BottomTable mint={tokenId} />
        </div>

        <div className="flex flex-col gap-2">
          <TokenMarketCap mint={tokenId} />
          <TokenBuySell tokenId={tokenId} />
        </div>
      </div>
    </div>
  );
}
