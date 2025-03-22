import React, { useState, useEffect, useRef } from "react";
import Truncate from "./truncate";

interface ShowMoreTextProps {
    children: React.ReactNode;
    lines?: number;
    more?: React.ReactNode;
    less?: React.ReactNode;
    anchorClass?: string;
    className?: string;
    onClick?: (expanded: boolean, event: React.MouseEvent<HTMLSpanElement>) => void;
    expanded?: boolean;
    width?: number;
    keepNewLines?: boolean;
    truncatedEndingComponent?: React.ReactNode;
    expandByClick?: boolean;
    onTruncate?: () => void;
}

const ShowMoreText: React.FC<ShowMoreTextProps> = ({
    children,
    lines = 3,
    more = "Show more",
    less = "Show less",
    anchorClass = "show-more-less-clickable",
    className,
    onClick,
    expanded: initialExpanded = false,
    width = 0,
    keepNewLines = false,
    truncatedEndingComponent = "... ",
    expandByClick = true,
    onTruncate,
}) => {
    const [expanded, setExpanded] = useState(initialExpanded);
    const [truncated, setTruncated] = useState(false);
    const truncateRef = useRef<Truncate>(null);

    useEffect(() => {
        setExpanded(initialExpanded);
    }, [initialExpanded]);

    const handleTruncate = (isTruncated: boolean) => {
        if (isTruncated !== truncated) {
            setTruncated(isTruncated);
            if (isTruncated && truncateRef.current) {
                truncateRef.current.onResize();
            }
            onTruncate?.();
        }
    };

    const toggleLines = (event: React.MouseEvent<HTMLSpanElement>) => {
        event.preventDefault();

        if (!expandByClick) {
            onClick?.(expanded, event);
            return;
        }

        const newExpanded = !expanded;
        setExpanded(newExpanded);
        onClick?.(newExpanded, event);
    };

    return (
        <div className={className}>
            <Truncate
                width={width}
                lines={!expanded ? lines : undefined}
                ellipsis={
                    <span>
                        {truncatedEndingComponent}
                        <span
                            className={anchorClass}
                            onClick={toggleLines}
                        >
                            {more}
                        </span>
                    </span>
                }
                onTruncate={handleTruncate}
                ref={truncateRef}
            >
                {keepNewLines && typeof children === 'string'
                    ? children.split("\n").map((line: string, i: number, arr: string[]) => {
                        const lineSpan = <span key={i}>{line}</span>;
                        if (i === arr.length - 1) {
                            return lineSpan;
                        } else {
                            return [lineSpan, <br key={i + "br"} />];
                        }
                    })
                    : children}
            </Truncate>
            {!truncated && expanded && (
                <span>
                    {" "}
                    <span
                        className={anchorClass}
                        onClick={toggleLines}
                    >
                        {less}
                    </span>
                </span>
            )}
        </div>
    );
};

export default ShowMoreText;