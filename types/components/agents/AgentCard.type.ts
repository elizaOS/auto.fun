import { AgentSummary } from "./index.type";

export type AgentCardProps = AgentSummary & {
  onClick: () => void;
};
