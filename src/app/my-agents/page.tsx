"use client";

import { useAgents } from "@/utils/agent";
import { Agents } from "./index";
import { useWallet } from "@solana/wallet-adapter-react";
import { AgentsGridSkeleton } from "./AgentsGridSkeleton";
import { useRouter } from "next/navigation";

export default function AgentsPage() {
  const { publicKey } = useWallet();
  const { data: agents, isLoading, refetch } = useAgents();
  const router = useRouter();

  if (agents !== undefined && "unauthenticated" in agents) {
    router.push("/");
    return null;
  }

  if (isLoading || !agents || !publicKey) {
    return <AgentsGridSkeleton />;
  }

  return (
    <Agents
      agents={agents}
      refetchAgents={async () => {
        await refetch();
      }}
    />
  );
}
