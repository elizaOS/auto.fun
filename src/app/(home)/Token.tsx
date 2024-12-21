import { Tweet } from "@/components/common/Tweet";
import Link from "next/link";
import { useTimeAgo } from "../formatTimeAgo";

export const Token = ({
  className,
  mint,
  marketCap,
  name,
  status,
  ticker,
  url,
  tweetUrl,
  createdAt,
}: {
  className?: string;
  mint: string;
  marketCap: string;
  name: string;
  status: string;
  ticker: string;
  url: string | undefined;
  tweetUrl: string;
  createdAt: string;
}) => {
  const timeAgo = useTimeAgo(createdAt);

  return (
    <Link
      className={`px-4 pt-4 pb-5 bg-[#401141] rounded-[20px] flex-col justify-start items-start gap-4 inline-flex ${className}`}
      href={`/coin/${mint}`}
    >
      <div className="self-stretch justify-between items-start inline-flex">
        <img
          className="w-[100px] h-[100px] relative rounded-xl border border-[#642064]"
          src={url}
          alt="placeholder"
        />
        <div className="px-2 py-1 bg-[#f743f6]/10 rounded-lg justify-start items-start gap-1 flex">
          {status === "active" ? (
            <>
              <div className="text-[#cab7c7] text-base font-medium leading-normal">
                Market cap:
              </div>
              <div className="text-[#f743f6] text-base font-medium leading-normal">
                ${marketCap}
              </div>
            </>
          ) : (
            <div className="text-[#cab7c7] text-base font-medium leading-normal">
              On Raydium
            </div>
          )}
        </div>
      </div>
      <div className="self-stretch h-12 flex-col justify-start items-start flex">
        <div className="self-stretch text-white text-xl font-bold font-secondary leading-normal">
          {name}
        </div>
        <div className="self-stretch text-[#cab7c7] text-xl font-bold font-secondary uppercase leading-normal">
          {ticker}
        </div>
      </div>
      <Tweet url={tweetUrl} />
      <div className="self-stretch text-[#cab7c7] text-base font-medium leading-normal">
        {timeAgo}
      </div>
    </Link>
  );
};
