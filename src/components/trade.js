import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatNumber } from "@/utils";
import { ArrowUpDown, Cog, Info, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import Button from "./button";
import ConfigDialog from "./config-dialog";
import SkeletonImage from "./skeleton-image";
export default function Trade({ token }) {
    const solanaPrice = token?.solPriceUSD || 0;
    const [isTokenSelling, setIsTokenSelling] = useState(false);
    const [sellingAmount, setSellingAmount] = useState(undefined);
    const [error] = useState("");
    const isDisabled = ["migrating", "migration_failed", "failed"].includes(token.status);
    return (_jsx("div", { className: "relative border rounded-md p-4 bg-autofun-background-card", children: _jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-col", children: [_jsxs("div", { className: twMerge([
                                "flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px] transition-colors duration-200",
                                error ? "border-autofun-text-error" : "",
                            ]), children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-primary select-none", children: "Selling" }), _jsxs("div", { className: "flex items-center gap-0.5 xl:ml-auto", children: [_jsx(Button, { size: "small", variant: "trade", children: "Reset" }), isTokenSelling ? (_jsxs(Fragment, { children: [_jsx(Button, { size: "small", variant: "trade", children: "25%" }), _jsx(Button, { size: "small", variant: "trade", children: "50%" }), _jsx(Button, { size: "small", variant: "trade", children: "100%" })] })) : (_jsxs(Fragment, { children: [_jsx(Button, { size: "small", variant: "trade", children: "0.5" }), _jsx(Button, { size: "small", variant: "trade", children: "1" }), _jsx(Button, { size: "small", variant: "trade", children: "5" })] })), _jsx(ConfigDialog, { children: _jsx(Button, { size: "small", variant: "trade", children: _jsx(Cog, {}) }) })] })] }), _jsxs("div", { className: "flex justify-between gap-3", children: [_jsx("input", { className: "text-4xl font-dm-mono text-autofun-text-secondary w-3/4 outline-none", min: 0, type: "number", onChange: ({ target }) => setSellingAmount(Number(target.value)), value: sellingAmount, placeholder: "0" }), _jsx("div", { className: "w-fit shrink-0", children: _jsx(TokenDisplay, { token: token, isSolana: !isTokenSelling }) })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-dm-mono text-autofun-text-secondary select-none", children: !isTokenSelling
                                                ? formatNumber(Number(sellingAmount || 0) * solanaPrice, true)
                                                : token?.tokenPriceUSD
                                                    ? formatNumber(Number(sellingAmount || 0) * token?.tokenPriceUSD, true)
                                                    : formatNumber(0) }), _jsx(Balance, { token: token, isSolana: !isTokenSelling })] })] }), _jsx("div", { className: "h-[10px] z-20 relative", children: _jsx("div", { onClick: () => setIsTokenSelling(!isTokenSelling), className: "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border-3 cursor-pointer select-none border-autofun-background-card bg-autofun-background-action-primary inline-flex", children: _jsx(ArrowUpDown, { className: "m-auto size-3.5" }) }) }), _jsxs("div", { className: "flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px]", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-primary select-none", children: "Buying" }), _jsxs("div", { className: "flex justify-between gap-3", children: [_jsx("span", { className: "text-4xl font-dm-mono text-autofun-text-secondary select-none", children: "0.00" }), _jsx(TokenDisplay, { token: token, isSolana: isTokenSelling })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-dm-mono text-autofun-text-secondary select-none", children: "$0" }), _jsx(Balance, { token: token, isSolana: isTokenSelling })] })] })] }), _jsxs("div", { className: twMerge([
                        "flex items-center gap-2 h-4 transition-opacity duration-200",
                        error ? "opacity-100" : "opacity-0",
                    ]), children: [_jsx(Info, { className: "text-autofun-text-error size-4" }), _jsx("p", { className: "text-autofun-text-error text-xs font-dm-mono", children: "Insufficient Funds: You have 0.0043 SOL" })] }), _jsx(Button, { variant: "secondary", className: "font-dm-mono", size: "large", disabled: isDisabled, children: "Swap" }), _jsx(Button, { variant: "secondary", className: "font-dm-mono", size: "large", children: "Connect" })] }) }));
}
const TokenDisplay = ({ token, isSolana, }) => {
    return (_jsxs("div", { className: "flex items-center gap-2 rounded-lg border bg-autofun-background-card p-2 select-none", children: [_jsx(SkeletonImage, { src: token?.image || "", alt: token?.name || "token", className: "rounded-full size-6" }), _jsx("span", { className: "text-base uppercase font-dm-mono tracking-wider", children: isSolana ? "SOL" : token?.ticker })] }));
};
const Balance = ({ token, isSolana, }) => {
    return (_jsxs("div", { className: "flex items-center gap-2 select-none", children: [_jsx(Wallet, { className: "text-autofun-text-secondary size-[18px]" }), _jsxs("span", { className: "text-sm font-dm-mono text-autofun-text-secondary uppercase", children: ["0.00 ", isSolana ? "SOL" : token?.ticker] })] }));
};
