import SkeletonImage from "@/components/skeleton-image";
import { IToken } from "@/types";
import { abbreviateNumber, fromNow } from "@/utils";
import { Link } from "react-router";

export default function GridView({ data }: { data: IToken[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {data?.map((token: IToken, _: number) => (
        <Link
          to={`/token/${token.mint}`}
          key={token.mint}
          className="bg-autofun-background-card"
        >
          <div className="flex flex-col min-w-0 relative">
            <div className="absolute left-0 bottom-0 px-3 min-w-0 z-10">
              <div className="flex justify-end items-end w-full min-w-0">
                {/* <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)]">
                  {token.name}
                </div> */}
                <div className="text-autofun-text-primary text-lg font-bold font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                  ${token.ticker}
                </div>
              </div>
            </div>
            <div className="flex flex-col w-full min-w-0 z-10">
              <div className="absolute bottom-0 right-0 p-2 px-3 inline-flex justify-start items-center gap-2 min-w-0">
                <div className="justify-start text-autofun-text-highlight text-xl font-medium font-dm-mono leading-7 truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
                  {abbreviateNumber(token.marketCapUSD)}
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-3 px-4 text-autofun-text-primary text-xs font-medium font-dm-mono z-1 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
              {fromNow(token.createdAt, true)}
            </div>
            <div className="w-full h-full aspect-square relative">
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent z-[1]"></div>
              <SkeletonImage
                src={token.image}
                alt="image"
                className="w-full h-full object-cover z-[-1]"
              />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
