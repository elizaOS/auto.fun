import { Pause } from "lucide-react";
import { twMerge } from "tailwind-merge";

export default function PausedIndicator({ show }: { show: boolean }) {
  return (
    <div
      className={twMerge([
        show ? "opacity-100" : "opacity-0",
        "flex items-center transition-opacity duration-200 p-1.5 px-2 gap-0.5 bg-autofun-background-card border text-autofun-text-highlight absolute right-2.5 top-1/2 transform -translate-y-1/2",
      ])}
    >
      <Pause className="size-3" />
      <span className="text-sm">Paused</span>
    </div>
  );
}
