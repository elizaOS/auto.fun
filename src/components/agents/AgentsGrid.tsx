import { PropsWithChildren } from "react";

export const AgentsGrid = ({ children }: PropsWithChildren) => {
  return (
    <main className="w-5/6 grid grid-cols-3 gap-4 lg:grid-cols-2 sm:grid-cols-1">
      {children}
    </main>
  );
};
