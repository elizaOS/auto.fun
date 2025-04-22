import { normalizedProgress } from "@/utils";
import { useState, useEffect, useRef } from "react";

// Add keyframes for the subtle pulse animation
const pulseKeyframes = `
@keyframes subtle-pulse {
  0% { opacity: 0.9; }
  50% { opacity: 1; }
  100% { opacity: 0.9; }
}
`;

export default function BondingCurveBar({ progress }: { progress: number }) {
  const [width, setWidth] = useState<number>(0);
  const [displayedValue, setDisplayedValue] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Ensure progress is not negative
  progress = Math.max(progress, 0);

  // Set up the animation effect when progress changes
  useEffect(() => {
    const targetValue = Number(normalizedProgress(progress));

    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Set the width immediately for the progress bar transition
    setWidth(targetValue);

    // Use a very short duration to make the counter almost immediate
    const startTime = performance.now();
    const startValue = displayedValue;
    const duration = 350; // Slightly faster (350ms vs 1500ms for progress bar)

    // Simple, fast animation function
    const animateFrame = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Fast linear animation - no fancy easing
      const currentDisplayValue = Math.round(
        startValue + (targetValue - startValue) * progress,
      );
      setDisplayedValue(currentDisplayValue);

      // If we're not done yet, continue
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateFrame);
      } else {
        // Ensure we set the exact target value at the end
        setDisplayedValue(targetValue);
      }
    };

    // Start animation immediately
    animationFrameRef.current = requestAnimationFrame(animateFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [progress, displayedValue]);

  return (
    <div ref={containerRef} className="relative w-full z-0 h-8">
      {/* Add keyframes style */}
      <style>{pulseKeyframes}</style>
      <div className="h-full w-full bg-autofun-stroke-primary overflow-hidden">
        <div
          className={`
            h-full bg-autofun-text-highlight z-20 
            transition-all duration-[1500ms] ease-in-out 
            flex items-center 
            ${width < 15 ? "justify-start" : "justify-end"}
            ${width === 100 ? 'animate-subtle-pulse' : ''}
          `}
          style={{
            width: `${width}%`,
          }}
        >
          <span className={`font-medium font-dm-mono text-sm px-1 whitespace-nowrap ${
            width >= 50 ? "text-black pr-2" : "text-autofun-text-secondary pl-2"
          }`}>
            {displayedValue}%
          </span>
        </div>
      </div>
    </div>
  );
}
