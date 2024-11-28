import Link from "next/link";
import { RoundedButton } from "../common/button/RoundedButton";

export const AgentsHeader = () => {
  return (
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
  );
};
