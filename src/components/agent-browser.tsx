"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Grid, Table as TableIcon } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useTokens } from "@/utils/tokens";
import Skeleton from "react-loading-skeleton";
import { Paginator } from "./common/Paginator";
import { VerifiedBanner } from "./verified-banner";
export type Agent = {
  id: number;
  name: string;
  mint: string;
  marketCap: string;
  priceChange: string;
  tvl: string;
  holders: number;
  volume: string;
  replies: number;
  getImageUrl: () => string;
};

export const columns: ColumnDef<Agent>[] = [
  {
    accessorKey: "name",
    header: "AI Agents",
  },
  { accessorKey: "marketCap", header: "Market Cap" },
  { accessorKey: "priceChange", header: "24h Change" },
  { accessorKey: "tvl", header: "TVL" },
  { accessorKey: "holders", header: "Holders" },
  { accessorKey: "volume", header: "24h Volume" },
  { accessorKey: "replies", header: "Inferences" },
];

export function AgentBrowser() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const {
    items: tokens,
    currentPage,
    hasPreviousPage,
    hasNextPage,
    nextPage,
    previousPage,
    isLoading,
  } = useTokens();
  const router = useRouter();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {[...Array(30)].map((_, index) => (
        <Card
          key={index}
          className="bg-[#171717] border-green-500/20 hover:border-green-500/50 transition-colors h-48 flex"
        >
          <div className="flex flex-col p-[24px] flex-1">
            <CardHeader className="p-0">
              <Skeleton
                width={120}
                height={24}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="mb-2"
              />
              <Skeleton
                width={80}
                height={16}
                baseColor="#171717"
                highlightColor="#00ff0026"
              />
            </CardHeader>
            <CardContent className="p-0 flex flex-col flex-1">
              <div className="mt-auto flex flex-col gap-1">
                <Skeleton
                  width={100}
                  height={16}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                />
              </div>
            </CardContent>
          </div>
          <div className="flex items-center justify-center flex-shrink-0 w-1/2">
            <Skeleton
              width="100%"
              height="100%"
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-r-lg"
            />
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <VerifiedBanner tokens={tokens.slice(-3)} />

      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-2">
          <p>New</p>
        </div>
        <div className="flex items-center gap-2">
          <Grid
            className={`cursor-pointer ${view === "grid" ? "text-green-500" : "text-gray-500"}`}
            onClick={() => setView("grid")}
          />
          <TableIcon
            className={`cursor-pointer ${view === "table" ? "text-green-500" : "text-gray-500"}`}
            onClick={() => setView("table")}
          />
          {/* <Toggle
            defaultPressed
            size="sm"
            className="text-gray-100 data-[state=on]:bg-gray-300/20 data-[state=on]:text-gray-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            Animations
          </Toggle> */}
        </div>
      </div>

      {isLoading ? (
        renderSkeletons()
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {tokens.map(
            ({
              mint,
              name,
              image,
              marketCapUSD,
              ticker,
              liquidity,
              holderCount,
              numComments,
            }) => {
              const mintDisplay = `${mint.slice(0, 3)}...${mint.slice(-3)}`;
              const numCommentsDisplay = numComments > 99 ? "99+" : numComments;

              return (
                <Card
                  key={mint}
                  className="bg-[#171717] border-green-500/20 hover:border-green-500/50 transition-colors flex flex-col cursor-pointer"
                  onClick={() => router.push(`/coin/${mint}`)}
                >
                  <div className="flex items-center justify-center flex-shrink-0 rounded-lg overflow-hidden m-2 aspect-[1.55] relative">
                    <img
                      src={image}
                      alt="Agent Preview"
                      className="object-cover h-full w-full"
                    />
                    <div className="h-[26px] px-1.5 py-1 bg-neutral-950 rounded-lg justify-start items-center gap-0.5 inline-flex absolute right-2 top-2">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M9.00039 1.5C8.01547 1.5 7.0402 1.69399 6.13026 2.0709C5.22032 2.44781 4.39353 3.00026 3.69709 3.6967C2.29056 5.10322 1.50039 7.01088 1.50039 9C1.49383 10.7319 2.09348 12.4114 3.19539 13.7475L1.69539 15.2475C1.59132 15.353 1.52082 15.4869 1.49279 15.6324C1.46476 15.7779 1.48045 15.9284 1.53789 16.065C1.60018 16.1999 1.70117 16.3133 1.82802 16.3908C1.95488 16.4682 2.10189 16.5063 2.25039 16.5H9.00039C10.9895 16.5 12.8972 15.7098 14.3037 14.3033C15.7102 12.8968 16.5004 10.9891 16.5004 9C16.5004 7.01088 15.7102 5.10322 14.3037 3.6967C12.8972 2.29018 10.9895 1.5 9.00039 1.5ZM9.00039 15H4.05789L4.75539 14.3025C4.89508 14.162 4.97348 13.9719 4.97348 13.7738C4.97348 13.5756 4.89508 13.3855 4.75539 13.245C3.77333 12.264 3.16177 10.9729 3.02491 9.5916C2.88804 8.21029 3.23434 6.82425 4.00481 5.66964C4.77527 4.51503 5.92223 3.66327 7.25027 3.25948C8.57832 2.85569 10.0053 2.92485 11.288 3.45519C12.5708 3.98552 13.63 4.94421 14.2852 6.16792C14.9404 7.39163 15.151 8.80466 14.8812 10.1663C14.6114 11.5279 13.8779 12.7538 12.8055 13.6352C11.7332 14.5166 10.3885 14.9989 9.00039 15Z"
                          fill="#12D359"
                        />
                      </svg>

                      <div className="text-[#03ff24] text-xs font-medium leading-none">
                        {numCommentsDisplay}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col p-[18px] flex-1">
                    <CardHeader className="p-0 mb-[22px]">
                      <Link href={`/coin/${mint}`}>
                        <CardTitle className="flex items-center gap-2 text-white">
                          {name}
                          <span className="text-[#a6a6a6] tracking-widest">
                            ${ticker}
                          </span>
                        </CardTitle>
                      </Link>

                      <CardDescription className="text-[#a6a6a6] flex items-center gap-2">
                        {mintDisplay}
                        <Copy
                          className="cursor-pointer text-[#03ff24] h-3"
                          onClick={() => handleCopy(mint)}
                        />
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex flex-col flex-1">
                      <div className="grid grid-cols-3">
                        <div className="gap-1 flex flex-col">
                          <div className="text-[#a6a6a6] text-[11px] font-normal uppercase leading-none tracking-widest">
                            Marketcap
                          </div>
                          <div className="text-[#03ff24] text-xs font-normal leading-tight">
                            {Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                              notation: "compact",
                            }).format(Number(marketCapUSD))}
                          </div>
                        </div>
                        <div className="gap-1 flex flex-col">
                          <div className="text-[#a6a6a6] text-[11px] font-normal uppercase leading-none tracking-widest">
                            Volume
                          </div>
                          <div className="text-white text-xs font-normal leading-tight">
                            {Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                              notation: "compact",
                            }).format(Number(liquidity))}
                          </div>
                        </div>
                        <div className="gap-1 flex flex-col">
                          <div className="text-[#a6a6a6] text-[11px] font-normal uppercase leading-none tracking-widest">
                            Holders
                          </div>
                          <div className="text-white text-xs font-normal leading-tight">
                            {holderCount}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            },
          )}
        </div>
      ) : (
        <Table className="min-w-full bg-[#0a0a0a] text-white">
          <TableHeader>
            <TableRow className="py-4 border-gray-600">
              <TableHead className="text-green-500 h-14">AI AGENTS</TableHead>
              <TableHead className="text-green-500 h-14">Market Cap</TableHead>
              <TableHead className="text-green-500 h-14">24h</TableHead>
              <TableHead className="text-green-500 h-14">
                Total Value Locked
              </TableHead>
              <TableHead className="text-green-500 h-14">
                Holders Count
              </TableHead>
              <TableHead className="text-green-500 h-14">24h Vol</TableHead>
              <TableHead className="text-green-500 h-14">Inferences</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-[#0a0a0a]">
            {tokens.map((token) => (
              <TableRow className="border-none " key={token.mint}>
                <TableCell className="flex items-center">
                  <img
                    src={token.image}
                    alt="Agent Preview"
                    className="h-12 w-12 rounded-full mr-2"
                  />
                  <div>
                    <Link href={`/coin/${token.mint}`}>
                      <span className="text-white">{token.name}</span>
                    </Link>
                    <div className="flex items-center gap-1 text-gray-300 text-xs">
                      {`${token.mint.slice(0, 3)}...${token.mint.slice(-3)}`}
                      <Copy
                        className="cursor-pointer text-gray-300 h-3"
                        onClick={() => handleCopy(token.mint)}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                  }).format(Number(token.marketCapUSD))}
                </TableCell>
                <TableCell>??</TableCell>
                <TableCell>
                  {" "}
                  {Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                  }).format(Number(token.liquidity))}
                </TableCell>
                <TableCell>??</TableCell>
                <TableCell>??</TableCell>
                <TableCell>??</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="mt-6 flex justify-center">
        <Paginator
          currentPage={currentPage}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          previousPage={previousPage}
          nextPage={nextPage}
        />
      </div>
    </div>
  );
}
