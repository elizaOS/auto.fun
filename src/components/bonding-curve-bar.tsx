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
  const [labelLeft, setLabelLeft] = useState(0);

  useEffect(() => {
    const containerWidth = containerRef.current?.offsetWidth || 0;
    const rawLeft = (containerWidth * width) / 120;
    const labelWidth = 30; // width for the label
    const padding = 3;

    const min = labelWidth / 2 + padding;
    const max = containerWidth - labelWidth / 2 - padding;

    setLabelLeft(Math.min(Math.max(rawLeft, min), max));
  }, [width]);

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

      {/* Background */}
      <div className="absolute left-0 h-full w-full bg-autofun-stroke-primary" />

      {/* Progress */}
      <div
        className="absolute left-0 h-full bg-autofun-text-highlight z-20 transition-all duration-1500 ease-in-out"
        style={{
          width: `${width}%`,
          transition:
            "width 1.5s ease-in-out, background-color 0.8s ease-in-out",
          animation:
            width === 100 ? "subtle-pulse 2s infinite ease-in-out" : "none",
        }}
      />

      {/* Percentage indicator - position changes based on progress */}
      <div
        className="absolute h-full flex items-center z-30 pointer-events-none"
        style={{
          left: `${labelLeft}px`,
          transform: "translateX(-50%)",
        }}
      >
        <span
          className={`font-medium font-dm-mono text-sm px-1 whitespace-nowrap ${
            width >= 50 ? "text-black" : "text-autofun-text-secondary"
          }`}
        >
          {displayedValue}%
        </span>
      </div>
    </div>
  );
}
