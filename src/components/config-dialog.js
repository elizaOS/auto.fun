import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Dialog, DialogContent, DialogTitle, DialogTrigger, } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { XIcon } from "lucide-react";
import { useState } from "react";
import Divider from "./divider";
import { twMerge } from "tailwind-merge";
import { useTransactionSpeed, } from "@/hooks/use-transaction-speed";
import { useSlippage } from "@/hooks/use-slippage";
import { useMevProtection, } from "@/hooks/use-mev-protection";
export default function ConfigDialog({ children }) {
    const [open, setOpen] = useState(false);
    const [transactionSpeed, setTransactionSpeed] = useTransactionSpeed();
    const [slippage, setSlippage] = useSlippage();
    const [mevProtection, setMevProtection] = useMevProtection();
    const storeSlippage = (num) => {
        if (num <= 0)
            return;
        if (num >= 100)
            return;
        setSlippage(num);
    };
    return (_jsxs(Dialog, { onOpenChange: (op) => setOpen(op), open: open, children: [_jsx(DialogTrigger, { asChild: true, children: children }), _jsx(VisuallyHidden, { children: _jsx(DialogTitle, {}) }), _jsx(DialogContent, { hideCloseButton: true, className: "p-4 max-w-[496px]", children: _jsxs("div", { className: "flex flex-col gap-6", children: [_jsxs("div", { className: "flex items-center gap-3 justify-between", children: [_jsx("h1", { className: "text-3xl text-autofun-text-highlight font-medium font-satoshi select-none", style: {
                                        letterSpacing: "-1.8%",
                                    }, children: "Trade Settings" }), _jsx(XIcon, { className: "size-5 text-autofun-icon-disabled cursor-pointer", onClick: () => setOpen(false) })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-0.5", children: [_jsxs("span", { className: "text-base font-medium font-satoshi uppercase text-autofun-text-primary", children: ["Slippage%:", " "] }), _jsx("span", { className: "font-normal font-satoshi text-autofun-text-highlight text-xl", style: {
                                                        lineHeight: '28px',
                                                        fontSize: '20px',
                                                        letterSpacing: '-1.4px',
                                                    }, children: Number(slippage).toFixed(1) })] }), _jsx("input", { className: "max-w-[120px] px-3 py-2 bg-[#0a0a0a] rounded-md text-white border outline-none", placeholder: "1.0%", min: "0", max: "100", step: "0.1", type: "number", onChange: ({ target }) => storeSlippage(Number(target.value)), value: slippage })] }), _jsx("p", { className: "font-medium text-base text-autofun-text-secondary font-satoshi", children: "This is the maximum amount of slippage you are willing to accept when placing trades" })] }), _jsx(Divider, {}), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { className: "flex justify-between items-center gap-3", children: [_jsx("span", { className: "text-base font-medium font-satoshi text-autofun-text-primary", children: "Speed" }), _jsx("div", { className: "p-1 rounded-md border flex items-center gap-2", children: ["fast", "turbo", "ultra"].map((speedItem, _) => {
                                                const isActive = speedItem === transactionSpeed;
                                                return (_jsx("div", { onClick: () => setTransactionSpeed(speedItem), className: twMerge([
                                                        "py-2 px-3 capitalize text-autofun-text-secondary text-sm font-dm-mono select-none cursor-pointer tracking-[-0.4px]",
                                                        isActive
                                                            ? "rounded-md bg-autofun-background-action-highlight text-autofun-background-primary font-medium"
                                                            : "",
                                                    ]), children: speedItem }));
                                            }) })] }), _jsx("p", { className: "font-medium text-base text-autofun-text-secondary font-satoshi", children: "Higher speeds will increase your priority fees, making your transactions confirm faster" })] }), _jsx(Divider, {}), _jsxs("div", { className: "flex justify-between items-center gap-3", children: [_jsx("span", { className: "text-base font-medium font-satoshi text-autofun-text-primary", children: "Enable front-running protection:" }), _jsx("div", { className: "p-1 rounded-md border flex items-center gap-2", children: [true, false].map((mevProtectionItem, _) => {
                                        const isActive = mevProtectionItem === mevProtection;
                                        const label = mevProtectionItem ? "on" : "off";
                                        return (_jsx("div", { onClick: () => setMevProtection(mevProtectionItem), className: twMerge([
                                                "py-2 px-3 capitalize text-autofun-text-secondary text-sm font-dm-mono select-none cursor-pointer tracking-[-0.4px]",
                                                isActive
                                                    ? "rounded-md bg-autofun-background-action-highlight text-autofun-background-primary font-medium"
                                                    : "",
                                            ]), children: label }));
                                    }) })] })] }) })] }));
}
