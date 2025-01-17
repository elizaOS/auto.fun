"use client";

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
          {tokens.map(({ mint, name, image, marketCapUSD }) => {
            const mintDisplay = `${mint.slice(0, 3)}...${mint.slice(-3)}`;

            return (
              <Card
                key={mint}
                className="bg-[#171717] border-green-500/20 hover:border-green-500/50 transition-colors h-48 flex"
              >
                <div className="flex flex-col p-[24px] flex-1">
                  <CardHeader className="p-0">
                    <Link href={`/coin/${mint}`}>
                      <CardTitle className="flex items-center gap-2 text-white">
                        {name}
                      </CardTitle>
                    </Link>

                    <CardDescription className="text-gray-300 flex items-center gap-2">
                      {mintDisplay}
                      <Copy
                        className="cursor-pointer text-gray-300 h-3"
                        onClick={() => handleCopy(mint)}
                      />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 flex flex-col flex-1">
                    <div className="mt-auto flex flex-col gap-1">
                      <div className="text-xs text-green-500">
                        <span className="text-gray-300">MC</span>{" "}
                        <b>
                          {Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            notation: "compact",
                          }).format(Number(marketCapUSD))}
                        </b>
                      </div>
                      {/* <div className="text-xs text-green-500">
                        <span className="text-gray-300">Volume</span>{" "}
                        <b>{token.volume}</b>
                      </div> */}
                    </div>
                  </CardContent>
                </div>
                <div className="flex items-center justify-center flex-shrink-0 w-1/2">
                  <img
                    src={image}
                    alt="Agent Preview"
                    className="object-cover h-full w-full rounded-r-lg"
                  />
                </div>
              </Card>
            );
          })}
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
