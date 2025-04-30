import SkeletonImage from "@/components/skeleton-image";
import { IToken } from "@/types";
import { abbreviateNumber, fromNow, resizeImage } from "@/utils";
import { Link } from "react-router";
import TokenStatus from "./token-status";
import Verified from "./verified";

export default function GridView({ data }: { data: IToken[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {data.map((token: IToken, _: number) => {
        return <GridItem token={token} key={token.mint} />;
      })}
    </div>
  );
}

export const GridItem = ({ token }: { token: IToken }) => {
  return (
    <Link
      to={`/token/${token.mint}`}
      className="bg-autofun-background-card group"
    >
      <div className="flex flex-col min-w-0 relative">
        <div className="absolute top-0 left-0 p-2 px-3 z-10 group-hover:opacity-100 opacity-0 transition-opacity duration-200">
          <TokenStatus token={token} />
        </div>
        <div className="absolute left-0 bottom-0 p-2 px-3 w-full z-10">
          <div className="flex items-center gap-4 justify-between">
            <div className="flex items-center gap-2 w-full min-w-0">
              <div className="bg-autofun-background-muted/65 px-1 text-autofun-text-primary text-lg font-bold font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                ${token.ticker}
              </div>
              <Verified isVerified={token?.verified ? true : false} />
            </div>
            <div className="bg-autofun-background-muted/65 px-1 text-autofun-text-primary text-lg shrink-0 font-medium font-dm-mono drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
              {fromNow(token.createdAt, true)}
            </div>
          </div>
        </div>
        <div className="flex flex-col w-full min-w-0 z-10">
          <div className="absolute flex flex-col top-0 right-0 p-2 px-3 items-end min-w-0 gap-2">
            <div className="bg-autofun-background-muted/65 px-1 text-autofun-text-highlight text-xl font-medium font-dm-mono leading-7 truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
              MC {abbreviateNumber(token.marketCapUSD)}
            </div>
            <div className="bg-autofun-background-muted/65 px-1 text-autofun-text-primary text-xl font-medium font-dm-mono leading-7 truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
              Vol {abbreviateNumber(token.volume24h)}
            </div>
          </div>
        </div>

        <div className="w-full h-full aspect-square relative">
          <div className="absolute top-0 rotate-180 aspect-square size-full bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8)_0%,transparent_20%,transparent_80%,rgba(0,0,0,0.5)_100%)] z-1" />
          <SkeletonImage
            src={resizeImage(token.image, 300, 300)}
            alt="image"
            className="w-full h-full object-cover aspect-square z-[-1]"
          />
        </div>
      </div>
    </Link>
  );
};
