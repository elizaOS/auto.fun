import React, { useState } from "react";
import { twMerge } from "tailwind-merge";

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

  const handleLoad = () => {
    setLoaded(true);
  };

  return (
    <div
      className={twMerge([
        "size-full select-none",
        parentClassName ? parentClassName : "",
      ])}
    >
      {/* Skeleton placeholder */}
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
        src={src}
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
