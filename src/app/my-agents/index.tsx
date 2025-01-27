import { useState } from "react";
import {
  AgentsProps,
  AgentSummary,
} from "../../../types/components/agents/index.type";
import { AgentCard } from "./AgentCard";
import { AgentUpdateForm } from "./AgentUpdateForm";
import Link from "next/link";
import { RoundedButton } from "@/components/common/button/RoundedButton";

export const Agents = ({ agents, refetchAgents }: AgentsProps) => {
  const [agent, setAgent] = useState<AgentSummary | null>(null);

  if (agent !== null) {
    return (
      <AgentUpdateForm
        {...agent}
        onBack={() => setAgent(null)}
        refetchAgents={refetchAgents}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 pt-10 items-center pb-10">
      <header className="w-5/6 flex flex-col gap-10">
        <h1 className="text-center text-2xl">My Agents</h1>
        <div className="flex justify-end">
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
              <AgentCard onClick={() => setAgent(agent)} {...agent} />
            </Link>
          );
        })}
      </main>
    </div>
  );
};
