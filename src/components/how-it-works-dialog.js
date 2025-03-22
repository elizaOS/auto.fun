import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Dialog, DialogContent, DialogTitle, DialogTrigger, } from "@/components/ui/dialog";
import { Fragment, useEffect, useState } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useLocation, Link } from "react-router";
import { twMerge } from "tailwind-merge";
import Button from "./button";
const TopButton = ({ isActive, title, onClick }) => {
    return (_jsx("div", { className: "h-[60px] flex place-items-center w-1/2 text-center select-none cursor-pointer border-b border-autofun-stroke-primary", onClick: onClick, children: _jsx("span", { className: twMerge([
                "mx-auto font-satoshi font-medium text-xl leading-7 tracking-[-0.02em] transition-colors duration-200",
                isActive
                    ? "text-autofun-text-highlight"
                    : "text-autofun-text-secondary",
            ]), children: title }) }));
};
const Divider = () => {
    return (_jsx("div", { className: "flex-shrink-0 w-full h-[1px] bg-autofun-stroke-primary" }));
};
const StepText = ({ step, text }) => {
    return (_jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("div", { className: "font-dm-mono font-medium text-xl tracking-[-0.02em] shrink-0 text-white", children: ["Step ", step, ":"] }), _jsx("div", { className: "font-dm-mono  font-normal text-base leading-6 tracking-[-0.6px] text-autofun-text-secondary mt-0.5", children: text })] }));
};
const TextWithCircle = ({ text }) => {
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "size-[6px] bg-autofun-background-action-highlight rounded-full" }), _jsx("p", { className: "font-dm-mono font-normal text-base tracking-[-0.6px] mt-0.5 text-autofun-text-secondary", children: text })] }));
};
const Trading = () => {
    return (_jsxs(Fragment, { children: [_jsx("p", { className: "font-satoshi font-normal text-base leading-6 tracking-normal text-autofun-text-secondary", children: "Auto.fun streamlines agentic trading through our token launching system. Create value for projects you believe in." }), _jsx(Divider, {}), _jsx(StepText, { step: 1, text: "Browse and select through our token from the marketplace" }), _jsx(Divider, {}), _jsx(StepText, { step: 2, text: "Buy tokens through our bonding curve mechanism" }), _jsx(Divider, {}), _jsx(StepText, { step: 3, text: "Buy and sell with instant liquidity" }), _jsx(Divider, {}), _jsx(StepText, { step: 4, text: "When the bonding curve completes, the token reaches a $100k market cap" }), _jsx(Divider, {}), _jsx(StepText, { step: 5, text: "Token transitions to Raydium" }), _jsx(Divider, {})] }));
};
const Creation = () => {
    return (_jsxs("div", { className: "flex flex-col gap-3", children: [_jsx("p", { className: "font-satoshi font-normal text-base leading-6 tracking-normal text-autofun-text-secondary", children: "Auto.fun creates a dual-pool trading environment for sustainable AI token launches." }), _jsxs("div", { className: "flex flex-col gap-3 overflow-y-auto max-h-96", children: [_jsx(Divider, {}), _jsx(StepText, { step: 1, text: "Initial Setup" }), _jsx(TextWithCircle, { text: "Configure token details & symbol" }), _jsx(TextWithCircle, { text: "Create or link an agent if desired" }), _jsx(TextWithCircle, { text: "Define project parameters" }), _jsx(Divider, {}), _jsx(StepText, { step: 2, text: "Buy tokens through our bonding curve mechanism" }), _jsx(TextWithCircle, { text: "Set optional creator allocation" }), _jsx(TextWithCircle, { text: "Initialize bonding curve" }), _jsx(TextWithCircle, { text: "Define project parameters" }), _jsx(Divider, {}), _jsx(StepText, { step: 3, text: "Step 3: Market Activity" }), _jsx(TextWithCircle, { text: "Trading begins in primary SOL pool" }), _jsx(Divider, {}), _jsx(StepText, { step: 4, text: "Raydium Graduation" }), _jsx(TextWithCircle, { text: "Once Token reaches $100k market cap, there is an automatic" }), _jsx(TextWithCircle, { text: "Transition to Raydium" }), _jsx(TextWithCircle, { text: "Maintains dual pool benefits" }), _jsx(TextWithCircle, { text: "Primary pool (SOL:Token) for main trading activity" }), _jsx(TextWithCircle, { text: "Secondary pool (Ai16z:Token) for secondary layer of liquidity" }), _jsx(Divider, {})] })] }));
};
export function HowItWorksDialog() {
    const [activeTab, setActiveTab] = useState("trading");
    const [open, setOpen] = useState(false);
    const pathname = useLocation();
    useEffect(() => {
        if (open) {
            setOpen(false);
        }
    }, [pathname]);
    useEffect(() => {
        if (activeTab !== "trading") {
            setActiveTab("trading");
        }
    }, [open]);
    return (_jsxs(Dialog, { open: open, onOpenChange: (op) => setOpen(op), children: [_jsx(DialogTrigger, { onClick: () => setOpen(true), asChild: true, children: _jsx("button", { className: "flex items-center justify-center px-3 py-2 gap-2 h-9 rounded-md bg-transparent text-autofun-text-secondary hover:text-white transition-colors duration-200", children: _jsx("span", { className: "text-base font-normal", children: "How It Works" }) }) }), _jsx(VisuallyHidden, { children: _jsx(DialogTitle, {}) }), _jsxs(DialogContent, { className: "sm:max-w-[597px] pt-0 pb-6 px-0", hideCloseButton: true, children: [_jsxs("div", { className: "flex items-center justify-center w-full divide-x", children: [_jsx(TopButton, { isActive: activeTab === "trading", title: "Token Trading", onClick: () => setActiveTab("trading") }), _jsx(TopButton, { isActive: activeTab === "creation", title: "Token Creation", onClick: () => setActiveTab("creation") })] }), _jsx("div", { className: "flex flex-col gap-4 px-4", children: activeTab === "trading" ? _jsx(Trading, {}) : _jsx(Creation, {}) }), _jsxs("div", { className: "flex flex-col gap-4 px-4", children: [_jsx(Button, { onClick: () => setOpen(false), size: "small", children: "Continue" }), _jsx("p", { className: "text-autofun-text-secondary text-base font-satoshi font-medium text-center", children: "By clicking this button you agree to the terms and conditions." }), _jsxs("div", { className: "flex items-center gap-4 mx-auto", children: [_jsx(Link, { to: "/privacy-policy", className: "text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4", children: "Privacy Policy" }), _jsx("div", { className: "h-5 w-[1px] bg-[#505050]" }), _jsx(Link, { to: "/terms-of-service", className: "text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4", children: "Terms of Service" }), _jsx("div", { className: "h-5 w-[1px] bg-[#505050]" }), _jsx(Link, { to: "/fees", className: "text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4", children: "Fees" })] })] })] })] }));
}
