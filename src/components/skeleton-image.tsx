import React, { useState } from "react";
import { twMerge } from "tailwind-merge";

interface SkeletonImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

const SkeletonImage: React.FC<SkeletonImageProps> = ({
  src,
  alt,
  className,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = () => {
    setLoaded(true);
  };

  return (
    <div className="relative size-full select-none">
      {/* Skeleton placeholder */}
      {!loaded && (
        <div
          className={twMerge(
            "absolute inset-0 bg-autofun-background-input animate-pulse rounded-sm",
            className
          )}
        />
      )}
      <img
        loading="lazy"
        src={src}
        alt={alt}
        onLoad={handleLoad}
        className={twMerge(
          "transition-opacity duration-200 rounded-sm object-cover size-full",
          loaded ? "opacity-100" : "opacity-0",
          className
        )}
        {...props}
      />
    </div>
  );
};

export default SkeletonImage;
