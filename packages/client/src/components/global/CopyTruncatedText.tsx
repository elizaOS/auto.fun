import React, { useState, useMemo, useCallback, MouseEvent } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyableTruncatedTextProps {
  text: string;
  startChars?: number;
  endChars?: number;
  className?: string;
  iconSize?: number;
  resetTimeoutMs?: number;
}

const CopyableTruncatedText= React.memo(({
  text,
  startChars = 4,
  endChars = 4,
  className = '',
  iconSize = 14,
  resetTimeoutMs = 1200,
}: CopyableTruncatedTextProps) => {
  const [copied, setCopied] = useState(false);

  const truncated = useMemo(() => {
    if (text.length <= startChars + endChars) {
      return text;
    }
    return `${text.slice(0, startChars)}…${text.slice(text.length - endChars)}`;
  }, [text, startChars, endChars]);

   
     const onCopy = async (e: React.MouseEvent) => {
       e.preventDefault();
       await navigator.clipboard.writeText(text);
       setCopied(true);
       setTimeout(() => setCopied(false), 1200);
   };

  return (
    <div className={`flex items-center justify-between ${className}`.trim()}>
      <span className="text-xs font-mono truncate" title={text}>
        {truncated}
      </span>
      <button
        onClick={onCopy}
        className="p-1 hover:bg-[#262626] rounded"
        title={copied ? 'Copied!' : 'Copy address'}
        aria-label={copied ? 'Copied!' : 'Copy address'}
        type="button"
      >
        {copied ? (
          <Check size={iconSize} className="text-green-400" />
        ) : (
          <Copy size={iconSize} className="text-autofun-text-primary" />
        )}
      </button>
    </div>
  );
});

export default CopyableTruncatedText;
