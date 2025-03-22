import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import TokenStatus from "@/components/token-status";
import Trade from "@/components/trade";
import { abbreviateNumber, formatNumber, fromNow, LAMPORTS_PER_SOL, normalizedProgress, shortenAddress, } from "@/utils";
import { getToken } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { InfoCircle } from "iconsax-react";
import { Globe } from "lucide-react";
import { Link, useParams } from "react-router";
import ShowMoreText from "react-show-more-text";
export default function Page() {
    const params = useParams();
    const address = params?.address;
    const query = useQuery({
        queryKey: ["token", address],
        queryFn: async () => {
            if (!address)
                throw new Error("No address passed");
            return await getToken({ address });
        },
        refetchInterval: 3_000,
    });
    const token = query?.data;
    const solPriceUSD = token?.solPriceUSD;
    const finalTokenPrice = 0.00000045; // Approximated value from the bonding curve configuration
    const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
    const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;
    if (query?.isLoading) {
        return _jsx(Loader, {});
    }
    return (_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { className: "col-span-2 flex flex-col gap-3", children: [_jsxs("div", { className: "flex border rounded-md bg-autofun-background-card p-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary", children: [_jsxs("div", { className: "flex flex-col gap-2 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "Market Cap" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-highlight", children: token?.marketCapUSD
                                            ? abbreviateNumber(token?.marketCapUSD)
                                            : null })] }), _jsxs("div", { className: "flex flex-col gap-2 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "24hr Volume" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-primary", children: token?.price24hAgo ? abbreviateNumber(token?.volume24h) : null })] }), _jsxs("div", { className: "flex flex-col gap-2 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "Creator" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-primary", children: token?.creator ? shortenAddress(token?.creator) : null })] }), _jsxs("div", { className: "flex flex-col gap-2 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "Creation Time" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-primary", children: token?.createdAt ? fromNow(token?.createdAt) : null })] })] }), _jsx("div", { className: "border rounded-md p-3 bg-autofun-background-card", children: "Chart" }), _jsx("div", { className: "border rounded-md p-3 bg-autofun-background-card", children: "Tables" })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { className: "border rounded-md p-4 bg-autofun-background-card flex flex-col gap-3", children: [_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: "w-36 shrink-0", children: _jsx(SkeletonImage, { src: token.image, alt: "image" }) }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsx("div", { className: "flex items-center w-full min-w-0", children: _jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx("div", { className: "capitalize text-autofun-text-primary text-3xl font-medium font-satoshi leading-normal truncate min-w-0", children: token.name }), _jsxs("div", { className: "text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0", children: ["$", token.ticker] })] }) }), _jsx(ShowMoreText
                                            /* Default options */
                                            , { 
                                                /* Default options */
                                                lines: 2, more: "Show more", less: "Show less", className: "text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight min-h-8", anchorClass: "text-autofun-text-primary hover:text-autofun-text-highlight transition-all duration-200", truncatedEndingComponent: " ... ", children: _jsx("span", { className: "text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight", children: token.description }) })] })] }), _jsxs("div", { className: "flex border rounded-md", children: [_jsx("div", { className: "size-10 rounded-l-md inline-flex border-r shrink-0 bg-autofun-background-action-primary", children: _jsx("span", { className: "text-base font-dm-mono m-auto text-autofun-text-secondary", children: "CA" }) }), _jsxs("div", { className: "bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2", children: [_jsx("span", { className: "text-base text-autofun-text-secondary truncate", children: token?.mint }), _jsx(CopyButton, { text: token?.mint })] })] }), _jsxs("div", { className: "flex items-center justify-between gap-0.5", children: [_jsx(Link, { to: token?.website, className: "w-full", target: "_blank", children: _jsx(Button, { className: "w-full rounded-none rounded-l-md", disabled: !token?.website, children: _jsx(Globe, {}) }) }), _jsx(Link, { to: token?.twitter, className: "w-full", target: "_blank", children: _jsx(Button, { className: "w-full rounded-none", disabled: !token?.twitter, children: _jsx(SkeletonImage, { src: "/x.svg", height: 24, width: 24, alt: "twitter_icon", className: "w-6 m-auto" }) }) }), _jsx(Link, { to: token?.telegram, className: "w-full", target: "_blank", children: _jsx(Button, { className: "w-full rounded-none py-0 flex", disabled: !token?.telegram, children: _jsx(SkeletonImage, { src: "/telegram.svg", height: 24, width: 24, alt: "telegram_icon", className: "size-6 object-contain m-auto h-full" }) }) }), _jsx(Link, { to: token?.website, className: "w-full", target: "_blank", children: _jsx(Button, { className: "w-full rounded-none rounded-r-md px-0", disabled: !token?.website, children: _jsx(SkeletonImage, { src: "/discord.svg", height: 24, width: 24, alt: "discord_icon", className: "w-auto m-auto" }) }) })] }), _jsxs("div", { className: "flex border rounded-md bg-autofun-background-card py-2 px-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary", children: [_jsxs("div", { className: "flex flex-col gap-1 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "Price USD" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-highlight", children: token?.marketCapUSD
                                                    ? abbreviateNumber(token?.marketCapUSD)
                                                    : null })] }), _jsxs("div", { className: "flex flex-col gap-1 items-center w-full", children: [_jsx("span", { className: "text-base font-dm-mono text-autofun-text-secondary", children: "Price" }), _jsx("span", { className: "text-xl font-dm-mono text-autofun-text-primary", children: token?.price24hAgo ? abbreviateNumber(token?.volume24h) : null })] })] }), _jsxs("div", { className: "flex flex-col gap-3.5", children: [_jsxs("div", { className: "flex justify-between gap-3.5", children: [_jsxs("p", { className: "font-medium font-satoshi", children: ["Bonding Curve Progress:", " ", _jsx("span", { className: "text-autofun-text-highlight", children: normalizedProgress(token?.curveProgress) === 100
                                                            ? "Completed"
                                                            : `${normalizedProgress(token?.curveProgress)}%` })] }), _jsx(InfoCircle, { className: "size-5 text-autofun-text-secondary" })] }), _jsx(BondingCurveBar, { progress: token?.curveProgress }), token?.status !== "migrated" ? (_jsxs("p", { className: "font-satoshi text-base text-autofun-text-secondary whitespace-pre", children: ["Graduate this coin to Raydium at", " ", formatNumber(graduationMarketCap, true), "market cap.", "\n", "There is", " ", formatNumber((token?.reserveLamport - token?.virtualReserves) /
                                                LAMPORTS_PER_SOL, true, true), " ", "SOL in the bonding curve."] })) : null, _jsx(TokenStatus, { token: token })] })] }), _jsx(Trade, { token: token })] })] }));
}
