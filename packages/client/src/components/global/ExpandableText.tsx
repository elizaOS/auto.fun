import { useState, MouseEvent } from 'react';

interface ExpandableTextProps {
  text: string;
  limit?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}

const ExpandableText = ({
  text,
  limit = 100,
  className = '',
  moreLabel = 'See more',
  lessLabel = 'See less',
}: ExpandableTextProps) => {
  const [open, setOpen] = useState(false);
  const needsTruncate = text.length > limit;
  const displayed = open || !needsTruncate ? text : text.slice(0, limit);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    setOpen(o => !o);
  };

  if (!needsTruncate) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={className}>
      {displayed}
      {!open && '…'}
      <button
        type="button"
        onClick={toggle}
        className="ml-1 text-autofun-link hover:underline inline"
      >
        {open ? lessLabel : moreLabel}
      </button>
    </p>
  );
};

export default ExpandableText;