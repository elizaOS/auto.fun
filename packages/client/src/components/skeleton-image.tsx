import React, { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { env } from "@/utils/env";

interface SkeletonImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  parentClassName?: string;
}

const SkeletonImage: React.FC<SkeletonImageProps> = ({
  src,
  alt,
  className,
  parentClassName,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [optimizedSrc, setOptimizedSrc] = useState<string>(src);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLoad = () => {
    setLoaded(true);
  };

  const imageOptimizationEnabled = src?.includes(env.imageOptimizationUrl);

  const updateImageSrc = useCallback(() => {
    if (imageOptimizationEnabled && ref?.current) {
      const width = ref.current.clientWidth;
      const height = ref.current.clientHeight;

      if (width > 0 && height > 0) {
        const cdnPathRegex = /https:\/\/auto\.fun\/cdn-cgi\/image\/([^/]*)/;
        const match = src.match(cdnPathRegex);

        let updatedSrc = src;

        if (match && match[1]) {
          const cdnParams = match[1];

          const updatedParams = cdnParams
            .split(",")
            .map((param) => {
              if (param.startsWith("width=")) {
                return `width=${width}`;
              } else if (param.startsWith("height=")) {
                return `height=${height}`;
              }
              return param;
            })
            .join(",");

          updatedSrc = src.replace(
            cdnPathRegex,
            `${env.imageOptimizationUrl}/${updatedParams}`,
          );
        }

        setOptimizedSrc(updatedSrc);
      }
    } else {
      setOptimizedSrc(src);
    }
  }, [ref, src, imageOptimizationEnabled]);

  const handleResize = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      updateImageSrc();
    }, 300);
  }, [updateImageSrc]);

  useEffect(() => {
    updateImageSrc();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [updateImageSrc, handleResize]);

  return (
    <div
      ref={ref}
      className={twMerge([
        "relative select-none",
        parentClassName ? parentClassName : "",
      ])}
    >
      {!loaded && (
        <div
          className={twMerge(
            "absolute inset-0 bg-autofun-background-input animate-pulse size-full",
            className,
          )}
        />
      )}
      <img
        loading="lazy"
        src={optimizedSrc}
        alt={alt}
        onLoad={handleLoad}
        className={twMerge(
          "transition-opacity duration-200 object-cover size-full",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
        {...props}
      />
    </div>
  );
};

export default SkeletonImage;
