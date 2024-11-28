"use client";

import { useState } from "react";
import { AgentData } from "../../../types/components/agents/index.type";
import { AgentCard } from "./AgentCard";
import { AgentsGrid } from "./AgentsGrid";
import { AgentsHeader } from "./AgentsHeader";
import { AgentUpdateForm } from "./AgentUpdateForm";

export const AgentsContainer = ({
  agentDatas,
}: {
  agentDatas: AgentData[];
}) => {
  const [agent, setAgent] = useState<AgentData | null>(null);

  if (agent !== null) {
    return <AgentUpdateForm {...agent} onBack={() => setAgent(null)} />;
  }

  return (
    <div className="flex flex-col gap-8 pt-10 items-center pb-10">
      <AgentsHeader />
      <AgentsGrid>
        {agentDatas.map((agentData) => {
          return (
            <AgentCard
              key={agentData.id}
              onClick={() => setAgent(agentData)}
              {...agentData}
            />
          );
        })}
      </AgentsGrid>
    </div>
  );
};
