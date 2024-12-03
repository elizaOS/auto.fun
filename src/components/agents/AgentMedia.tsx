import { useMemo } from "react";
import { AgentData } from "../../../types/components/agents/index.type";
import Image from "next/image";

export const AgentMedia = ({ image_src }: Pick<AgentData, "image_src">) => {
  const mimeType = useMemo(() => {
    const mimeType = image_src?.match(/data:(.*?);base64,/)?.[1];
    return mimeType;
  }, [image_src]);

  if (!image_src || !mimeType) {
    return (
      <Image
        src={"/anonymous.png"}
        alt="agent media"
        width={45}
        height={45}
        className="rounded-lg"
      />
    );
  }

  return mimeType === "video/mp4" ? (
    <video
      autoPlay
      loop
      muted
      playsInline
      src={image_src}
      width={45}
      height={45}
      className="rounded-lg"
    />
  ) : (
    <Image
      className="rounded-lg"
      width={45}
      height={45}
      src={image_src}
      alt="agent media"
    />
  );
};
