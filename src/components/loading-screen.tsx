"use client";

import { useEffect, useState } from "react";

export function LoadingScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className="relative">
        <div className="w-32 h-32 border-4 border-green-500 rounded-full animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-green-500 font-mono animate-pulse">
            auto.fun
          </span>
        </div>
        <div className="absolute -inset-4">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-12 bg-green-500/20"
              style={{
                transform: `rotate(${i * 30}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
