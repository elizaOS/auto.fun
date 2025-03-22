import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { normalizedProgress } from "@/utils";
import { useState, useEffect } from "react";
export default function BondingCurveBar({ progress }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const prog = normalizedProgress(progress);
        setWidth(Number(prog));
    }, [progress]);
    return (_jsxs("div", { className: "relative w-full h-2", children: [_jsx("div", { className: "absolute left-0 h-2 w-full bg-autofun-stroke-primary rounded-md" }), _jsx("div", { className: "absolute left-0 h-2 bg-gradient-to-r from-green-900 to-green-500 rounded-md z-20 transition-all duration-500", style: { width: `${width}%` } })] }));
}
