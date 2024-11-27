import { PropsWithChildren } from "react";
import { RoundedButton } from "../common/button/RoundedButton";
import Link from "next/link";

export const AgentsContainer = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex flex-col gap-8 pt-10 items-center pb-10">
      <header className="w-5/6 flex flex-col gap-10">
        <h1 className="text-center text-2xl">My Agents</h1>
        <div className="flex justify-end">
          <Link href="/">
            <RoundedButton className="p-3 font-medium">
              Create New Agent
            </RoundedButton>
          </Link>
        </div>
      </header>
      <main className="w-5/6 grid grid-cols-3 gap-4 lg:grid-cols-2 sm:grid-cols-1">
        {children}
      </main>
    </div>
  );
};
