import { Pause } from "lucide-react";
import { twMerge } from "tailwind-merge";

export default function PausedIndicator({ show }: { show: boolean }) {
  return (
    <div
      className={twMerge([
        show ? "opacity-100" : "opacity-0",
        "flex items-center transition-opacity duration-200 p-1 px-1 gap-0.5 bg-autofun-background-card border text-autofun-text-highlight",
      ])}
    >
      <Pause />
    </div>
  );
}
