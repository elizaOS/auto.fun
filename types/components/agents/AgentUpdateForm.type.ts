import { AgentsProps, AgentSummary } from "./index.type";

export type AgentUpdateFormProps = {
  onBack: () => void;
} & AgentSummary &
  Pick<AgentsProps, "refetchAgents">;
