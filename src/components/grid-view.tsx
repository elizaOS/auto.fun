import SkeletonImage from "@/components/skeleton-image";
import { IToken } from "@/types";
import { abbreviateNumber, fromNow, resizeImage } from "@/utils";
import { Link } from "react-router";
import { Tooltip } from "react-tooltip";
import Verified from "./verified";

export default function GridView({ data }: { data: IToken[] }) {
  // this is for testing purpose only, untill we have implemented partner tokens
  const parntnerMintList = [
    "B6t4KWk4MTGadFwzwTorAv5fmxw7v2bS7J74dRkw8FUN",
    "78c5zQY31XJ38U1TdH6WWEaa4AgxDPXq5fJr2q5rgFUN",
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
      {data
        ?.filter((token: IToken) => token.image !== "")
        .filter(
          (token, index, self) =>
            self.findIndex((t) => t.mint === token.mint) === index,
        )
        .map((token: IToken, _: number) => {
          const isPartner = parntnerMintList.includes(token.mint);
          return (
            <Link
              to={`/token/${token.mint}`}
              key={token.mint}
              className="bg-autofun-background-card"
            >
              <div className="flex flex-col min-w-0 relative">
                <div className="absolute left-0 bottom-0 p-2 px-3 min-w-0 z-10">
                  <div className="flex justify-end items-center gap-2 w-full min-w-0">
                    {/* <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)]">
                  {token.name}
                </div> */}
                    <div className="text-autofun-text-primary text-lg font-bold font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                      ${token.ticker}
                    </div>
                    <Verified isVerified={token?.verified ? true : false} />
                  </div>
                </div>
                <div className="flex flex-col w-full min-w-0 z-10">
                  <div className="absolute flex flex-col bottom-0 right-0 p-2 px-3 items-end min-w-0">
                    <div className="text-autofun-text-primary text-xl font-medium font-dm-mono leading-7 truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                      Vol {abbreviateNumber(token.volume24h)}
                    </div>
                    <div className="text-autofun-text-highlight text-xl font-medium font-dm-mono leading-7 truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                      MC {abbreviateNumber(token.marketCapUSD)}
                    </div>
                  </div>
                </div>
                <div className="absolute top-0 right-0 p-5 px-4 text-autofun-text-primary text-xs font-medium font-dm-mono drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                  {fromNow(token.createdAt, true)}
                </div>
                <div className="w-full h-full aspect-square relative">
                  <div className="absolute inset-x-0 top-0 rotate-180 h-1/3 bg-gradient-to-t from-black/90 via-transparent to-transparent z-1" />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent z-1" />
                  {isPartner ? (
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-autofun-background-action-highlight/10 to-transparent z-1 p-4 font-bold">
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-autofun-background-action-highlight/10 to-transparent z-1 p-4 font-bold">
                        <div
                          id="partner-token"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <img
                            src="/verified.svg"
                            className="size-6"
                            alt="verified-mark"
                          />
                        </div>

                        <Tooltip
                          anchorSelect="#partner-token"
                          content="Verified by Auto.fun"
                          place="top-start"
                          noArrow
                        />
                      </div>
                    </div>
                  ) : null}
                  <SkeletonImage
                    src={resizeImage(token.image, 300, 300)}
                    alt="image"
                    className="w-full h-full object-cover z-[-1]"
                  />
                </div>
              </div>
            </Link>
          );
        })}
    </div>
  );
}
