import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import SkeletonImage from "./skeleton-image";
export default function Loader() {
    return (_jsx("div", { className: "flex items-center justify-center h-[50vh]", children: _jsxs("div", { className: "flex items-center flex-col gap-3", children: [_jsx(SkeletonImage, { src: "/logo.png", width: 128, height: 128, alt: "logo", className: "size-8 animate-pulse mx-auto" }), _jsx("div", { className: "font-dm-mono text-base text-autofun-text-secondary", children: "Loading" })] }) }));
}
