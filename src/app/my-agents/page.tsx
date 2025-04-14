"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAgents } from "@/utils/agent";
import { AgentsGridSkeleton } from "./AgentsGridSkeleton";

import { AgentCard } from "./AgentCard";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useEffect, useMemo, useState } from "react";
import { Token } from "@/utils/tokens";
import { womboApi } from "@/utils/fetch";
import { TokenSchema } from "@/utils/tokenSchema";
import { z } from "zod";
import { AgentMedia } from "./AgentMedia";

export default function AgentsPage() {
  const { publicKey } = useWallet();
  const { data: agents, isLoading } = useAgents();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!publicKey) return;
    const fetchUserTokens = async () => {
      const response: { tokens: Token[] } = await womboApi.get({
        endpoint: `/tokens?creator=${publicKey?.toBase58()}`,
        schema: z.object({
          tokens: z.array(TokenSchema),
        }),
      });

      if (response.tokens) {
        setTokens(response.tokens);
      }
    };
    if (!tokens) {
      fetchUserTokens();
    }
  }, [publicKey, tokens]);

  const tokensWithoutAgents = useMemo(() => {
    if (!tokens || !agents || !Array.isArray(agents)) return null;

    return tokens.filter(
      (token) => !agents.some((agent) => agent.contractAddress === token.mint),
    );
  }, [tokens, agents]);

  if (agents !== undefined && "unauthenticated" in agents) {
    router.push("/");
    return null;
  }

  if (isLoading || !agents || !publicKey) {
    return <AgentsGridSkeleton />;
  }

  return (
    <div className="flex flex-col justify-center items-center gap-[24px] pt-[64px] items-center max-w-[1360px] w-full self-center">
      <header className="flex flex-col self-stretch gap-10">
        <div className="flex justify-end self-end">
          <Link href="/create">
            <RoundedButton className="p-3">Create New Token</RoundedButton>
          </Link>
        </div>
      </header>
      <h2 className="text-center text-2xl">My Agents</h2>
      <div className="flex gap-4 flex-wrap w-full items-center justify-center">
        {agents.map((agent) => {
          return <AgentCard key={agent._id} {...agent} />;
        })}
      </div>
      <h2 className="text-center text-2xl">My Tokens</h2>
      <div className="flex gap-4 flex-wrap w-full items-center justify-center">
        {tokensWithoutAgents &&
          tokensWithoutAgents.map((token) => {
            return (
              <div
                key={token.mint}
                className="flex flex-col bg-[#171717] p-6 rounded-xl gap-6 max-w-[420px] w-full border-solid border-[1px] border-[#03FF24]/15 hover:border-[#03FF24]/50 cursor-pointer"
                onClick={() => router.push(`/coin/${token.mint}`)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex gap-3 items-center">
                    <AgentMedia image_src={token.image} />
                    <Link href={`/coin/${token.mint}`}>
                      <p className="text-lg">{token.name}</p>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
