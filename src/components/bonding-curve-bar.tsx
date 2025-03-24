import { normalizedProgress } from "@/utils";
import { useState, useEffect } from "react";

export default function BondingCurveBar({ progress }: { progress: number }) {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const prog = normalizedProgress(progress);
    setWidth(Number(prog));
  }, [progress]);

  return (
    <div className="relative w-full z-0 h-2">
      {/* Background */}
      <div className="absolute left-0 h-2 w-full bg-autofun-stroke-primary rounded-md" />
      {/* Progress */}
      <div
        className="absolute left-0 h-2 bg-gradient-to-r from-green-900 to-green-500 rounded-md z-20 transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
