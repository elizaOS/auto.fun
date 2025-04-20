import { useState, useEffect } from "react";

const BreakpointIndicator = () => {
  const getBreakpoint = (width: number) => {
    if (width >= 1536) return "2xl";
    if (width >= 1280) return "xl";
    if (width >= 1024) return "lg";
    if (width >= 768) return "md";
    if (width >= 640) return "sm";
    return "xs";
  };

  const [breakpoint, setBreakpoint] = useState(
    getBreakpoint(window.innerWidth),
  );

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (window.location.hostname !== "localhost") return;

  return (
    <div className="select-none fixed bottom-4 left-4 bg-autofun-background-card text-white p-2 rounded border">
      {breakpoint}
    </div>
  );
};

export default BreakpointIndicator;
