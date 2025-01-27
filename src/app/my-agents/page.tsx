"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAgents } from "@/utils/agent";
import { AgentsGridSkeleton } from "./AgentsGridSkeleton";

import { AgentCard } from "./AgentCard";
import { RoundedButton } from "@/components/common/button/RoundedButton";

export default function AgentsPage() {
  const { publicKey } = useWallet();
  const { data: agents, isLoading } = useAgents();
  const router = useRouter();

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
        <h1 className="text-center text-2xl">My Agents</h1>
        <div className="flex justify-end self-end">
          <Link href="/create">
            <RoundedButton className="p-3">Create New Agent</RoundedButton>
          </Link>
        </div>
      </header>
      <main className="flex gap-4 flex-wrap w-full items-center justify-center">
        {agents.map((agent) => {
          return <AgentCard key={agent._id} {...agent} />;
        })}
      </main>
    </div>
  );
}
