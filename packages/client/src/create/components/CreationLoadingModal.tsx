import { useEffect, useState } from "react";

interface CreationLoadingModalProps {
  isCreating: boolean;
  creationStep: string;
  creationStage:
    | "initializing"
    | "confirming"
    | "creating"
    | "validating"
    | "finalizing";
}

export const CreationLoadingModal = ({
  isCreating,
  creationStep,
  creationStage,
}: CreationLoadingModalProps) => {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 90);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isCreating) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div className="bg-[#1A1A1A]/80 p-6 shadow-lg max-w-md w-full">
        <div className="flex items-center flex-col gap-3">
          <div
            style={{
              width: "128px",
              height: "128px",
              perspective: "1000px",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
                transformStyle: "preserve-3d",
                transition: "transform 0.5s ease",
                transform: `rotateY(${rotation}deg)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
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

              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
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

              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
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

              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  overflow: "hidden",
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
          <p className="font-dm-mono text-base text-autofun-text-secondary">
            {creationStep}
          </p>
          {creationStage === "confirming" && (
            <p className="font-dm-mono text-sm text-autofun-text-secondary/80">
              Please confirm the transaction in your wallet
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
