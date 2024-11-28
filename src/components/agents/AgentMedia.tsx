import { useMemo } from "react";
import { AgentData } from "../../../types/components/agents/index.type";
import Image from "next/image";

export const AgentMedia = ({ mediaSrc }: Pick<AgentData, "mediaSrc">) => {
  const mimeType = useMemo(() => {
    const mimeType = mediaSrc.match(/data:(.*?);base64,/)?.[1];
    return mimeType;
  }, [mediaSrc]);

  return mimeType === "video/mp4" ? (
    <video
      autoPlay
      loop
      muted
      playsInline
      src={mediaSrc}
      width={45}
      height={45}
    />
  ) : (
    <Image width={45} height={45} src={mediaSrc} alt="agent media" />
  );
};
