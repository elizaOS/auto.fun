import { useEffect, useState, CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

export default function Loader({
  className,
  isFullscreen,
}: {
  className?: string;
  isFullscreen?: boolean;
}) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 90);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const containerStyle: CSSProperties = {
    width: "128px",
    height: "128px",
    perspective: "1000px",
    marginTop: "20px",
  };

  const cubeStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    transformStyle: "preserve-3d",
    transition: "transform 0.5s ease",
    transform: `rotateY(${rotation}deg)`,
  };

  const faceStyle: CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  };

  return (
    <div
      className={twMerge([
        "flex items-center justify-center h-[50vh]",
        isFullscreen
          ? "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          : "",
        className ? className : "",
      ])}
    >
      <div className="flex items-center flex-col gap-3">
        <div style={containerStyle}>
          <div style={cubeStyle}>
            {/* Front face - left half */}
            <div
              style={{
                ...faceStyle,
                transform: "rotateY(0deg) translateZ(64px)",
              }}
            >
              <img
                src="/logo_wide.svg"
                alt="logo front"
                style={{
                  height: "100%",
                  width: "256px",
                  objectFit: "cover",
                  objectPosition: "-3% 0",
                }}
              />
            </div>

            {/* Right face - right half */}
            <div
              style={{
                ...faceStyle,
                transform: "rotateY(90deg) translateZ(64px)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <img
                  src="/logo_wide.svg"
                  alt="logo right"
                  style={{
                    position: "absolute",
                    height: "100%",
                    width: "256px",
                    right: 0,
                    objectFit: "cover",
                    objectPosition: "100% 0",
                  }}
                />
              </div>
            </div>

            {/* Back face - left half (same as front) */}
            <div
              style={{
                ...faceStyle,
                transform: "rotateY(180deg) translateZ(64px)",
              }}
            >
              <img
                src="/logo_wide.svg"
                alt="logo back"
                style={{
                  height: "100%",
                  width: "256px",
                  objectFit: "cover",
                  objectPosition: "-3% 0",
                }}
              />
            </div>

            {/* Left face - right half (same as right) */}
            <div
              style={{
                ...faceStyle,
                transform: "rotateY(270deg) translateZ(64px)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <img
                  src="/logo_wide.svg"
                  alt="logo left"
                  style={{
                    position: "absolute",
                    height: "100%",
                    width: "256px",
                    right: 0,
                    objectFit: "cover",
                    objectPosition: "100% 0",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
