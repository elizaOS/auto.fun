import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";
import { HowItWorksDialog } from "./how-it-works-dialog";
export default function Header() {
    return (_jsx("div", { className: "border-b py-6", children: _jsxs("div", { className: "container flex items-center", children: [_jsx(Link, { to: "/", className: "mr-6 select-none", children: _jsx("img", { className: "size-10", src: "/logo.png" }) }), _jsx(NavLink, { title: "Tokens", href: "/" }), _jsx(HowItWorksDialog, {}), _jsx(NavLink, { title: "Support", href: "/support" })] }) }));
}
const NavLink = ({ title, href }) => {
    const location = useLocation();
    return (_jsx(Link, { to: href, className: "px-3 py-2", children: _jsx("div", { className: twMerge([
                "text-center justify-center text-base font-medium font-satoshi leading-tight transition-all duration-200",
                location.pathname === href
                    ? "text-autofun-text-primary"
                    : "text-autofun-text-secondary",
            ]), children: title }) }));
};
