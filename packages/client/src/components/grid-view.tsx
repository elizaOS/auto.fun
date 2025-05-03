import SkeletonImage from "@/components/skeleton-image";
import { IToken } from "@/types";
import { abbreviateNumber, fromNow, resizeImage } from "@/utils";
import { Link } from "react-router";
import TokenStatus from "./token-status";
import Verified from "./verified";
import CurveProgressBar from "@/components/home/curve-progress-bar";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import ExpandableText from "./global/ExpandableText";
import CopyableTruncatedText from "./global/CopyTruncatedText";

export default function GridView({ data }: { data: IToken[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {data.map((token: IToken, _: number) => {
        return <GridItem token={token} key={token.mint} />;
      })}
    </div>
  );
}
const truncateMiddle = (s: string, start = 4, end = 4) =>
  `${s.slice(0, start)}…${s.slice(s.length - end)}`;

export const GridItem = ({ token, featuredSection = false }: { token: IToken, featuredSection?: boolean }) => {
  return (
    <Link
      to={`/token/${token.mint}`}
      className={`
        flex
        bg-[#171717]
        border border-[#262626]
        rounded-[2px]
        overflow-hidden
        hover:scale-[1.01]
        transition-transform duration-200
        cursor-pointer
        flex-col
      `}
      aria-label={`View details for ${token.name}`}
    >
      <div className={
        `flex gap-4  w-full
        ${featuredSection ? 'flex-col ' : 'flex-row px-4 py-2'}`}>
        <div className={`
          ${featuredSection ? 'w-full ' : 'w-30 h-30'}
          flex-shrink-0
          relative
          rounded-md
          overflow-hidden
        `}>
          <SkeletonImage
            src={resizeImage(token.image, 350, 350)}
            alt={`${token.name} logo`}
            className="w-full h-full object-cover"
          />

        </div>

        <div className={`flex-1 flex flex-col
           justify-between text-[#A6A6A6]
             w-full
              ${featuredSection ? 'p-2' : 'p-0'}
             `}>
          <div className="flex items-center space-x-2 w-full">
            <h3 className="text-md font-bold truncate text-white">
              {token.name}
            </h3>
            <Verified isVerified={!!token.verified} />

            <span className="text-xs font-mono  truncate">
              ${token.ticker}
            </span>
            <time
              dateTime={token.createdAt}
              className="
              ml-auto
             border border-[#262626]
              px-[2px] text-xs 
              font-mono"
            >
              {fromNow(token.createdAt, true)}
            </time>
          </div>
          <div className="flex items-baseline justify-between ">
            <div className="mt-2 flex items-baseline justify-between flex-col">
              <span className="text-md ">
                Market Cap
              </span>
              <span className="text-lg font-bold text-green-400">
                {abbreviateNumber(token.marketCapUSD)}
              </span>
            </div>
            <CopyableTruncatedText
              text={token.mint} />

          </div>

        </div>
      </div>
      {token.status === "active" && token.imported === 0  && !featuredSection && (
            <div className="px-4 mb-2">
              <div className="flex justify-between items-center text-sm font-medium text-gray-200 mb-1">
                <span className="text-[#A6A6A6]">Bonding Curve Progress</span>
                <span className="stext-[#03ff24]">{Math.round(token.curveProgress)}%</span>
              </div>
              <CurveProgressBar progress={token.curveProgress} />
            </div>
          )}
      {token.description && !featuredSection && (
        <div className="px-4 py-2 border-t border-[#262626] text-[#A6A6A6]">
          <ExpandableText
            text={token.description}
            className="text-sm text-autofun-text-primary"
            limit={100}
            moreLabel="See more"
            lessLabel="See less"
          />
        </div>
      )}

    </Link>
  );
};


