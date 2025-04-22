import { twMerge } from "tailwind-merge";

export default function PausedIndicator({ show }: { show: boolean }) {
  return (
    <div
      className={twMerge([
        show ? "opacity-100" : "opacity-0",
        "flex items-center transition-opacity duration-200 p-1.5 px-2 gap-0.5 bg-autofun-background-card border text-autofun-text-highlight",
      ])}
    >
      <span className="text-sm">Paused</span>
    </div>
  );
}
