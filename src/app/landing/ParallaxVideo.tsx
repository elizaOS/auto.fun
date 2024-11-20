// pages/index.tsx

import { useState, useEffect } from "react";

export const ParallaxVideo = () => {
  // State variables to store the offset values
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);

  useEffect(() => {
    // Event handler for mouse movement
    const handleMouseMove = (event: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      // Calculate the mouse position relative to the center of the screen
      const x = (event.clientX / innerWidth - 0.5) * 30; // Adjust multiplier as needed
      const y = (event.clientY / innerHeight - 0.5) * 30;
      setOffsetX(x);
      setOffsetY(y);
    };

    // Add event listener on mount
    window.addEventListener("mousemove", handleMouseMove);

    // Remove event listener on unmount
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Inline style combining centering and offset transforms
  const transformStyle = {
    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
  };

  return (
    <div className="relative w-full h-screen overflow-hidden -z-10">
      <video
        src="/landing.mp4" // Replace with your video path
        autoPlay
        loop
        muted
        className="fixed top-1/2 left-1/2 w-[110vw] h-[110vh] object-cover"
        style={transformStyle}
      />
    </div>
  );
};
