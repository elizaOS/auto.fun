import React, { ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

interface TruncateProps {
  children: ReactNode;
  ellipsis?: ReactNode;
  lines?: number | false;
  width?: number;
  trimWhitespace?: boolean;
  onTruncate?: (isTruncated: boolean) => void;
}

interface TruncateRef {
  onResize: () => void;
}

const Truncate = forwardRef<TruncateRef, TruncateProps>((props, ref) => {
    const {
        children = "",
        ellipsis = "…",
        lines = 1,
        trimWhitespace = false,
        width = 0,
        onTruncate,
        ...spanProps
    } = props;
    
    const [targetWidth, setTargetWidth] = useState<number | null>(null);
    const elementsRef = useRef<{
        target: HTMLSpanElement | null;
        text: HTMLSpanElement | null;
        ellipsis: HTMLSpanElement | null;
    }>({
        target: null,
        text: null,
        ellipsis: null
    });
    const replacedLinksRef = useRef<Array<any>>([]);
    const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const [truncatedText, setTruncatedText] = useState<ReactNode>(null);
    
    // Style for hidden ellipsis element
    const ellipsisStyle = {
        position: 'fixed',
        visibility: 'hidden',
        top: 0,
        left: 0,
    } as React.CSSProperties;
    
    const extractReplaceLinksKeys = useCallback((content: string): string => {
        let i = 0;
        replacedLinksRef.current = [];
        
        return content.replace(
            /(<a[\s]+([^>]+)>((?:.(?!\<\/a\>))*.)<\/a>)/g,
            function () {
                const item: any = Array.prototype.slice.call(arguments, 1, 4);
                item.key = "[" + "@".repeat(item[2].length - 1) + "=" + i++ + "]";
                replacedLinksRef.current.push(item);
                
                return item.key;
            }
        );
    }, []);
    
    const createMarkup = useCallback((content: string): ReactNode => {
        let result = content;
        replacedLinksRef.current.forEach((item) => {
            result = result.replace(item.key, item[0]);
        });
        
        return <span dangerouslySetInnerHTML={{ __html: result }} />;
    }, []);
    
    // Shim innerText to consistently break lines at <br/> but not at \n
    const innerText = useCallback((node: HTMLElement): string => {
        const div = document.createElement("div");
        const contentKey = 
            "innerText" in window.HTMLElement.prototype
                ? "innerText"
                : "textContent";
        
        const content = node.innerHTML.replace(/\r\n|\r|\n/g, " ");
        div.innerHTML = extractReplaceLinksKeys(content);
        
        let text = div[contentKey] || '';
        
        const test = document.createElement("div");
        test.innerHTML = "foo<br/>bar";
        
        if (test[contentKey]?.replace(/\r\n|\r/g, "\n") !== "foo\nbar") {
            div.innerHTML = div.innerHTML.replace(/<br.*?[\/]?>/gi, "\n");
            text = div[contentKey] || '';
        }
        
        return text;
    }, [extractReplaceLinksKeys]);
    
    const calcTargetWidth = useCallback((callback?: () => void) => {
        const target = elementsRef.current.target;
        
        // Calculation is no longer relevant, since node has been removed
        if (!target) {
            return;
        }
        
        const computedWidth = width || 
            // Floor the result to deal with browser subpixel precision
            Math.floor(target.parentElement?.getBoundingClientRect().width || 0);
        
        // Delay calculation until parent node is inserted to the document
        if (!computedWidth) {
            return window.requestAnimationFrame(() => calcTargetWidth(callback));
        }
        
        const style = window.getComputedStyle(target);
        
        const font = [
            style.fontWeight,
            style.fontStyle,
            style.fontSize,
            style.fontFamily,
        ].join(" ");
        
        if (canvasContextRef.current) {
            canvasContextRef.current.font = font;
        }
        
        setTargetWidth(computedWidth);
        
        if (callback) {
            callback();
        }
    }, [width]);
    
    const measureWidth = useCallback((text: string): number => {
        return canvasContextRef.current?.measureText(text).width || 0;
    }, []);
    
    const ellipsisWidth = useCallback((node: HTMLElement): number => {
        return node.offsetWidth;
    }, []);
    
    const trimRight = useCallback((text: string): string => {
        return text.replace(/\s+$/, "");
    }, []);
    
    const handleTruncate = useCallback((didTruncate: boolean) => {
        if (typeof onTruncate === "function") {
            timeoutRef.current = window.requestAnimationFrame(() => {
                onTruncate(didTruncate);
            });
        }
    }, [onTruncate]);
    
    // Truncate text and prepare the resulting lines
    const truncateText = useCallback(() => {
        if (!elementsRef.current.text || !elementsRef.current.ellipsis || targetWidth === null) {
            return null;
        }
        
        const textNode = elementsRef.current.text;
        const textContent = innerText(textNode);
        if (!textContent) return null;
        
        const textLines = textContent.split("\n").map((line) => line.split(" "));
        let didTruncate = true;
        const currentEllipsisWidth = ellipsisWidth(elementsRef.current.ellipsis);
        
        const linesToRender: Array<ReactNode> = [];
        
        if (typeof lines !== 'number' || lines <= 0) {
            // No truncation needed
            didTruncate = false;
            handleTruncate(didTruncate);
            return children;
        }
        
        for (let lineIndex = 1; lineIndex <= lines; lineIndex++) {
            if (textLines.length === 0) break;
            
            const textWords = textLines[0];
            
            // Handle newline
            if (textWords.length === 0) {
                linesToRender.push(<br key={`br-${lineIndex}`} />);
                textLines.shift();
                lineIndex--;
                continue;
            }
            
            const lineText = textWords.join(" ");
            
            if (measureWidth(lineText) <= targetWidth) {
                if (textLines.length === 1) {
                    // Line is end of text and fits without truncating
                    didTruncate = false;
                    linesToRender.push(
                        <span key={`line-${lineIndex}`}>{createMarkup(lineText)}</span>
                    );
                    break;
                }
                
                // Line fits, add it and continue
                linesToRender.push(
                    <span key={`line-${lineIndex}`}>{createMarkup(lineText)}</span>
                );
                if (lineIndex < lines) {
                    linesToRender.push(<br key={`br-${lineIndex}`} />);
                }
                textLines.shift();
                continue;
            }
            
            // Line doesn't fit
            if (lineIndex === lines) {
                // This is the last line, truncate it
                const textRest = textWords.join(" ");
                
                // Binary search to find how much text we can include
                let lower = 0;
                let upper = textRest.length - 1;
                
                while (lower <= upper) {
                    const middle = Math.floor((lower + upper) / 2);
                    const testLine = textRest.slice(0, middle + 1);
                    
                    if (measureWidth(testLine) + currentEllipsisWidth <= targetWidth) {
                        lower = middle + 1;
                    } else {
                        upper = middle - 1;
                    }
                }
                
                let lastLineText = textRest.slice(0, lower);
                
                if (trimWhitespace) {
                    lastLineText = trimRight(lastLineText);
                }
                
                // Clean up any partial links
                if (lastLineText.substr(lastLineText.length - 2) === "][") {
                    lastLineText = lastLineText.substring(0, lastLineText.length - 1);
                }
                
                lastLineText = lastLineText.replace(/\[@+$/, "");
                
                // Add the truncated last line with ellipsis
                linesToRender.push(
                    <span key={`line-${lineIndex}`}>
                        {createMarkup(lastLineText)}
                        {ellipsis}
                    </span>
                );
            } else {
                // Not the last line, find the break point
                let lower = 0;
                let upper = textWords.length - 1;
                
                while (lower <= upper) {
                    const middle = Math.floor((lower + upper) / 2);
                    const testLine = textWords.slice(0, middle + 1).join(" ");
                    
                    if (measureWidth(testLine) <= targetWidth) {
                        lower = middle + 1;
                    } else {
                        upper = middle - 1;
                    }
                }
                
                // If no words fit, process as last line
                if (lower === 0) {
                    lineIndex = lines - 1;
                    continue;
                }
                
                const fittingText = textWords.slice(0, lower).join(" ");
                linesToRender.push(
                    <span key={`line-${lineIndex}`}>{createMarkup(fittingText)}</span>
                );
                if (lineIndex < lines) {
                    linesToRender.push(<br key={`br-${lineIndex}`} />);
                }
                
                // Remove processed words from textWords array
                textLines[0].splice(0, lower);
            }
        }
        
        handleTruncate(didTruncate);
        
        return linesToRender;
    }, [
        targetWidth,
        elementsRef,
        innerText,
        lines,
        measureWidth,
        ellipsisWidth,
        ellipsis,
        trimWhitespace,
        trimRight,
        createMarkup,
        handleTruncate,
        children
    ]);
    
    const onResize = useCallback(() => {
        calcTargetWidth();
    }, [calcTargetWidth]);
    
    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        onResize
    }));
    
    // Initial setup on mount
    useEffect(() => {
        const canvas = document.createElement("canvas");
        canvasContextRef.current = canvas.getContext("2d");
        
        calcTargetWidth(() => {
            // Node not needed in document tree to read its content
            const textElement = elementsRef.current.text;
            if (textElement && textElement.parentNode) {
                textElement.parentNode.removeChild(textElement);
            }
        });
        
        window.addEventListener("resize", onResize);
        
        // Cleanup on unmount
        return () => {
            const ellipsisElement = elementsRef.current.ellipsis;
            if (ellipsisElement && ellipsisElement.parentNode) {
                ellipsisElement.parentNode.removeChild(ellipsisElement);
            }
            
            window.removeEventListener("resize", onResize);
            
            if (timeoutRef.current !== null) {
                window.cancelAnimationFrame(timeoutRef.current);
            }
        };
    }, [calcTargetWidth, onResize]);
    
    // Update when children change
    useEffect(() => {
        // Force update on children change
    }, [children]);
    
    // Update when width changes
    useEffect(() => {
        calcTargetWidth();
    }, [width, calcTargetWidth]);
    
    // Update truncated text when dependencies change
    useEffect(() => {
        if (elementsRef.current.target && targetWidth) {
            setTruncatedText(truncateText());
        }
    }, [targetWidth, truncateText]);
    
    // Extract type-safe width from spanProps
    const { width: propsWidth, ...restProps } = spanProps as any;
    const maxWidth = typeof propsWidth === 'number' && propsWidth > 0 
        ? `${propsWidth}px` 
        : "unset";
    
    return (
        <span
            {...restProps}
            ref={(targetEl) => {
                elementsRef.current.target = targetEl;
            }}
        >
            <span
                style={{
                    display: "block",
                    maxWidth
                }}
            >
                {truncatedText}
            </span>
            <span
                ref={(textEl) => {
                    elementsRef.current.text = textEl;
                }}
            >
                {children}
            </span>
            <span
                ref={(ellipsisEl) => {
                    elementsRef.current.ellipsis = ellipsisEl;
                }}
                style={ellipsisStyle}
            >
                {ellipsis}
            </span>
        </span>
    );
});

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
    const truncateRef = useRef<TruncateRef>(null);

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