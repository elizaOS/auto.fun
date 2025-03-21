import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Trade from "@/components/trade";
import { IToken } from "@/types";
import { abbreviateNumber, fromNow, shortenAddress } from "@/utils";
import { getToken } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import { useParams } from "react-router";

export default function Page() {
  const params = useParams();
  const address = params?.address;

  const query = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      return await getToken({ address });
    },
    refetchInterval: 3_000,
  });

  const token: IToken = query?.data;
  console.log(token);

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Left Section */}
      <div className="col-span-2 flex flex-col gap-3">
        {/* Info */}
        <div className="flex border rounded-md bg-autofun-background-card p-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary">
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Market Cap
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-highlight">
              {token?.marketCapUSD
                ? abbreviateNumber(token?.marketCapUSD)
                : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              24hr Volume
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.price24hAgo ? abbreviateNumber(token?.volume24h) : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creator
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.creator ? shortenAddress(token?.creator) : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creation Time
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.createdAt ? fromNow(token?.createdAt) : null}
            </span>
          </div>
        </div>
        {/* Chart */}
        <div className="border rounded-md p-3 bg-autofun-background-card">
          Chart
        </div>
        <div className="border rounded-md p-3 bg-autofun-background-card">
          Tables
        </div>
      </div>
      {/* Right Section */}
      <div className="flex flex-col gap-3">
        <div className="border rounded-md p-4 bg-autofun-background-card flex flex-col gap-3">
          <div className="flex border rounded-md">
            <div className="size-10 rounded-l-md inline-flex border-r shrink-0 bg-autofun-background-action-primary">
              <span className="text-base font-dm-mono m-auto text-autofun-text-secondary">
                CA
              </span>
            </div>
            <div className="bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2">
              <span className="text-base text-autofun-text-secondary truncate">
                {token?.mint}
              </span>
              <CopyButton text={token?.mint} />
            </div>
          </div>
        </div>
        <Trade token={token} />
      </div>
    </div>
  );
}
