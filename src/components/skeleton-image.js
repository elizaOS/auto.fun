import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
const SkeletonImage = ({ src, alt, className, ...props }) => {
    const [loaded, setLoaded] = useState(false);
    const handleLoad = () => {
        setLoaded(true);
    };
    return (_jsxs("div", { className: "relative size-full select-none", children: [!loaded && (_jsx("div", { className: twMerge("absolute inset-0 bg-autofun-background-input animate-pulse rounded-sm size-full", className) })), _jsx("img", { loading: "lazy", src: src, alt: alt, onLoad: handleLoad, className: twMerge("transition-opacity duration-200 rounded-sm object-cover size-full", loaded ? "opacity-100" : "opacity-0", className), ...props })] }));
};
export default SkeletonImage;
