import { normalizedProgress } from "@/utils";
import { useState, useEffect } from "react";

export default function BondingCurveBar({ progress }: { progress: number }) {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const prog = normalizedProgress(progress);
    setWidth(Number(prog));
  }, [progress]);

  return (
    <div className="relative w-full z-0 h-8">
      {/* Background */}
      <div className="absolute left-0 h-full w-full bg-autofun-stroke-primary" />
      {/* Progress */}
      <div
        className={`absolute left-0 h-full ${
          width === 100 ? "bg-autofun-text-highlight" : "bg-white"
        } z-20 transition-all duration-500 flex items-center justify-end`}
        style={{ width: `${width}%` }}
      >
        <span className="text-black font-medium font-dm-mono text-sm mr-2">
          {width}%
        </span>
      </div>
      
      {/* Percentage indicator (appears when progress bar is too small) */}
      {width < 15 && (
        <div className="absolute right-0 h-full flex items-center z-30">
          <span className="text-autofun-text-secondary font-medium font-dm-mono text-sm mr-2">
            {width}%
          </span>
        </div>
      )}
    </div>
  );
}
