import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useToken } from "@/utils/tokens";
import Link from "next/link";

export const MigrationOverlay = ({ tokenId }: { tokenId: string }) => {
  const { data: token } = useToken({ variables: tokenId });

  if (!token) return null;

  const href = `https://raydium.io/swap/?inputCurrency=sol&outputMint=${token.mint}`;

  switch (token.status) {
    case "locked":
    case "migrated":
    case "migrating":
    case "withdrawn":
      return (
        <div className="absolute inset-0 backdrop-blur-md z-50 rounded-xl overflow-hidden flex flex-col p-4">
          <div className="flex flex-col items-center justify-center flex-1">
            <svg
              width="49"
              height="48"
              viewBox="0 0 49 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mb-3"
            >
              <path
                d="M8.50059 10.001H12.5006M10.5006 8.00098V12.001M23.5006 8.00098L22.5006 12.001M36.5006 10.001H40.5006M38.5006 8.00098V12.001M30.5006 18.001L28.5006 20.001M36.5006 26.001L40.5006 25.001M36.5006 38.001H40.5006M38.5006 36.001V40.001M28.5006 33.037L15.4646 20.001L6.68459 39.161C6.51105 39.533 6.45618 39.9494 6.52743 40.3536C6.59868 40.7579 6.7926 41.1304 7.08286 41.4207C7.37312 41.711 7.74567 41.9049 8.14993 41.9761C8.55419 42.0474 8.97058 41.9925 9.34259 41.819L28.5006 33.037Z"
                stroke="#F743F6"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className="flex-col justify-start items-center gap-2.5 inline-flex">
              <div className="w-[349px] text-center">
                <span className="text-white text-base font-bold font-['Inter'] leading-normal">
                  The pool has been seeded. This coin has migrated to{" "}
                </span>
                <Link
                  href={href}
                  target="_blank"
                  className="text-[#f743f6] text-base font-bold font-['Inter'] leading-normal"
                >
                  Raydium
                </Link>
                <span className="text-white text-base font-bold font-['Inter'] leading-normal">
                  .
                </span>
              </div>
            </div>
          </div>

          <RoundedButton
            className="p-3"
            onClick={() => window.open(href, "_blank")}
          >
            View on Raydium
          </RoundedButton>
        </div>
      );
    default:
      return null;
  }
};
