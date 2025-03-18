import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export default function CopyButton({
  text,
  className,
}: {
  text: string | number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string | number) => {
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      onClick={() => handleCopy(text)}
      className={twMerge(
        "flex items-center justify-center text-autofun-icon-secondary hover:text-white transition-colors p-0 cursor-pointer",
        className
      )}
    >
      {copied ? (
        <Check className="text-autofun-icon-highlight size-[18px]" />
      ) : (
        <Copy className="size-[18px]" />
      )}
    </div>
  );
}
