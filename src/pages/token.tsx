import Button from "@/components/button";
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
        <div className="border rounded-md p-4 bg-autofun-background-card">
          Token Info
        </div>
        <div className="relative border rounded-md p-4 bg-autofun-background-card">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              {/* Selling */}
              <div className="flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px]">
                <span className="text-base font-dm-mono text-autofun-text-primary">
                  Selling
                </span>
                <span className="text-4xl font-dm-mono text-autofun-text-secondary">
                  0.00
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    $0
                  </span>
                </div>
              </div>
              <div className="h-[10px] z-20 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border-3 cursor-pointer select-none border-autofun-background-card bg-autofun-background-action-primary inline-flex">
                  <ArrowUpDown className="m-auto size-3.5" />
                </div>
              </div>
              {/* Buying */}
              <div className="flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px]">
                <span className="text-base font-dm-mono text-autofun-text-primary">
                  Buying
                </span>
                <span className="text-4xl font-dm-mono text-autofun-text-secondary">
                  0.00
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    $0
                  </span>
                </div>
              </div>
            </div>

            <Button variant="secondary" className="font-dm-mono" size="large">
              Connect
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
