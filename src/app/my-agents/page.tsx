"use client";

import { useAgents } from "@/utils/agent";
import { useWallet } from "@solana/wallet-adapter-react";
import { AgentsGridSkeleton } from "./AgentsGridSkeleton";
import { useRouter } from "next/navigation";

import { AgentCard } from "./AgentCard";
import Link from "next/link";
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
    <div className="flex flex-col gap-8 pt-10 items-center pb-10">
      <header className="flex flex-col self-stretch gap-10">
        <h1 className="text-center text-2xl">My Agents</h1>
        <div className="flex justify-end self-end">
          <Link href="/create">
            <RoundedButton className="p-3 font-medium">
              Create New Agent
            </RoundedButton>
          </Link>
        </div>
      </header>
      <main className="grid xl:grid-cols-3 grid-cols-1 gap-4 lg:grid-cols-2">
        {agents.map((agent) => {
          return (
            <Link href={`/my-agents/${agent._id}`} key={agent._id}>
              <AgentCard {...agent} />
            </Link>
          );
        })}
      </main>
    </div>
  );
}
