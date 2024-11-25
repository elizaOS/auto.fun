import { ReactNode } from "react";

export type OutputAreaProps = {
  label: ReactNode;
  content: string;
  onRefresh: () => void;
};
