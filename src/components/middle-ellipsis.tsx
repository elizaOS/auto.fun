import { useEffect, useRef, useState } from "react";

interface MiddleEllipsisProps {
  text?: string;
  suffixProp?: string;
}

export default function MiddleEllipsis({ text, suffixProp }: MiddleEllipsisProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setShowFull(entry.contentRect.width > 420);
      }
    });

    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, []);

  if (!text) return null;

  const prefix = text.substring(0, 8);
  const suffix = text.substring(text.length - 8);

  return (
    <div ref={elementRef} className="font-dm-mono text-center" title={text}>
      {showFull ? text : `${prefix}...${suffix}`}
    </div>
  );
} 