import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BreakpointIndicator from "@/components/breakpoint-indicator";
import Header from "@/components/header";
import { Outlet } from "react-router";
export default function Layout() {
    return (_jsxs("div", { className: "min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased", children: [_jsx(Header, {}), _jsxs("main", { className: "flex-grow container py-10", children: [_jsx(Outlet, {}), _jsx(BreakpointIndicator, {})] })] }));
}
