import { Pause } from "lucide-react";

export default function PausedIndicator() {
  return (
    <div className="flex items-center p-1.5 px-2 gap-0.5 bg-autofun-background-card border text-autofun-text-highlight absolute right-2.5 top-1/2 transform -translate-y-1/2">
      <Pause className="size-3" />
      <span className="text-sm">Paused</span>
    </div>
  );
}
