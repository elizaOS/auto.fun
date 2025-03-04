// /* eslint-disable @typescript-eslint/no-unused-vars */
// "use client";
// import { useRouter } from "next/navigation";
// import { useState } from "react";
// import { Copy } from "lucide-react";
// import {
//   Table,
//   TableHeader,
//   TableBody,
//   TableRow,
//   TableHead,
//   TableCell,
// } from "@/components/ui/table";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { ColumnDef } from "@tanstack/react-table";
// import Link from "next/link";
// import { useTokens } from "@/utils/tokens";
// import Skeleton from "react-loading-skeleton";
// import { Paginator } from "./common/Paginator";
// import { VerifiedBanner } from "./verified-banner";
// import { DM_Mono } from 'next/font/google';
// import { Listbox } from "@headlessui/react";
// import { ChevronDownIcon } from "@heroicons/react/20/solid";
// import { AgentCard } from "./agent-card";

// // Initialize the font
// const dmMono = DM_Mono({
//   weight: ['400', '500'],
//   subsets: ['latin'],
// });

// export type Agent = {
//   id: number;
//   name: string;
//   mint: string;
//   marketCap: string;
//   priceChange: string;
//   tvl: string;
//   holders: number;
//   volume: string;
//   replies: number;
//   getImageUrl: () => string;
// };

// export const columns: ColumnDef<Agent>[] = [
//   {
//     accessorKey: "name",
//     header: "AI Agents",
//   },
//   { accessorKey: "marketCap", header: "Market Cap" },
//   { accessorKey: "priceChange", header: "24h Change" },
//   { accessorKey: "tvl", header: "TVL" },
//   { accessorKey: "holders", header: "Holders" },
//   { accessorKey: "volume", header: "24h Volume" },
//   { accessorKey: "replies", header: "Inferences" },
// ];

// interface SortOption {
//   label: string;
//   value: string;
// }

// const sortOptions: SortOption[] = [
//   { label: 'Creation Time (Newest)', value: 'newest' },
//   { label: 'Creation Time (Oldest)', value: 'oldest' },
//   { label: 'Market Cap (High to Low)', value: 'mcap_high' },
//   { label: 'Market Cap (Low to High)', value: 'mcap_low' },
// ];

// export function AgentBrowser() {
//   const [view, setView] = useState<"grid" | "table">("grid");
//   const [sortBy, setSortBy] = useState(sortOptions[0].value);
//   const [isCreationDropdownOpen, setIsCreationDropdownOpen] = useState(false);
//   const {
//     items: tokens,
//     currentPage,
//     hasPreviousPage,
//     hasNextPage,
//     nextPage,
//     previousPage,
//     isLoading,
//   } = useTokens();
//   const router = useRouter();

//   const handleCopy = (text: string) => {
//     navigator.clipboard.writeText(text);
//   };

//   const handleViewChange = (newView: "grid" | "table") => {
//     setView(newView);
//   };

//   const handleSortChange = (sort: "all" | "marketcap" | "creation") => {
//     setSortBy(sort);
//     // Add your sorting logic here
//     if (sort === "marketcap") {
//       // Sort by market cap
//     } else if (sort === "creation") {
//       // Sort by creation time
//     }
//   };

//   const renderSkeletons = () => (
//     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
//       {[...Array(12)].map((_, index) => (
//         <Card
//           key={`skeleton-${index}`}
//           className="bg-[#171717] border-green-500/20 hover:border-green-500/50 transition-colors h-[288px] flex flex-col overflow-hidden"
//         >
//           <div className="flex p-[16px_12px] h-full">
//             <div className="flex w-[120px] h-[127.5px] flex-none">
//               <Skeleton
//                 width={120}
//                 height={127.5}
//                 baseColor="#171717"
//                 highlightColor="#00ff0026"
//                 className="rounded-md"
//               />
//             </div>
            
//             <div className="flex flex-col flex-1 ml-3 min-w-0">
//               <div className="flex justify-between items-start w-full mb-3">
//                 <div className="flex-1 min-w-0 pr-2">
//                   <Skeleton
//                     width="80%"
//                     height={24}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                 </div>
//                 <div className="flex-shrink-0">
//                   <Skeleton
//                     width={60}
//                     height={24}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                 </div>
//               </div>
              
//               <div className="mb-3">
//                 <Skeleton
//                   width={80}
//                   height={16}
//                   baseColor="#171717"
//                   highlightColor="#00ff0026"
//                   className="mb-1"
//                 />
//                 <div className="flex justify-between items-center">
//                   <Skeleton
//                     width={60}
//                     height={21}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                   <Skeleton
//                     width={100}
//                     height={16}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                 </div>
//               </div>
              
//               <div className="mb-3">
//                 <div className="flex justify-between items-center mb-1">
//                   <Skeleton
//                     width="70%"
//                     height={16}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                   <Skeleton
//                     width={40}
//                     height={16}
//                     baseColor="#171717"
//                     highlightColor="#00ff0026"
//                   />
//                 </div>
//                 <Skeleton
//                   width="100%"
//                   height={8}
//                   baseColor="#171717"
//                   highlightColor="#00ff0026"
//                   className="rounded-full"
//                 />
//               </div>
//             </div>
//           </div>
          
//           <div className="px-[12px] mb-3">
//             <Skeleton
//               width="100%"
//               height={40}
//               baseColor="#171717"
//               highlightColor="#00ff0026"
//             />
//             <div className="w-full h-[1px] bg-[#262626] mt-2" />
//           </div>
          
//           <div className="px-[12px] mt-auto mb-[12px]">
//             <Skeleton
//               width="100%"
//               height={44}
//               baseColor="#171717"
//               highlightColor="#00ff0026"
//               className="rounded-md"
//             />
//           </div>
//         </Card>
//       ))}
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-black">
//       <div className="max-w-[1440px] mx-auto px-5">
//         {/* Header Controls */}
//         <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-4 border-b border-[#262626]/40">
//           {/* Left Controls */}
//           <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
//             {/* View Toggle */}
//             <div className="flex-shrink-0 flex items-center h-10 bg-[#171717] rounded-lg">
//               <button
//                 onClick={() => handleViewChange("grid")}
//                 className={`flex items-center justify-center w-14 h-[39px] rounded-l-lg transition-all duration-200
//                   ${view === "grid" 
//                     ? "bg-[#2E2E2E]" 
//                     : "bg-[#171717] hover:bg-[#262626]"}`}
//               >
//                 <img
//                   src="/grid.svg"
//                   className={`w-6 h-6 transition-opacity duration-200 
//                     ${view === "grid" ? "opacity-100" : "opacity-50"}`}
//                   alt="Grid View"
//                 />
//               </button>
//               <button
//                 onClick={() => handleViewChange("table")}
//                 className={`flex items-center justify-center w-14 h-[39px] rounded-r-lg transition-all duration-200
//                   ${view === "table" 
//                     ? "bg-[#2E2E2E]" 
//                     : "bg-[#171717] hover:bg-[#262626]"}`}
//               >
//                 <img
//                   src="/list.svg"
//                   className={`w-6 h-6 transition-opacity duration-200 
//                     ${view === "table" ? "opacity-100" : "opacity-50"}`}
//                   alt="List View"
//                 />
//               </button>
//             </div>

//             {/* Filter Buttons */}
//             <div className="flex gap-2 flex-shrink-0">
//               <button
//                 onClick={() => handleSortChange("all")}
//                 className={`px-4 py-2 rounded-lg transition-all duration-200
//                   ${sortBy === "all" 
//                     ? "bg-[#2E2E2E] text-[#2FD345]" 
//                     : "bg-[#171717] text-white hover:bg-[#262626]"}`}
//               >
//                 All
//               </button>
//               <button
//                 onClick={() => handleSortChange("marketcap")}
//                 className={`px-4 py-2 rounded-lg transition-all duration-200
//                   ${sortBy === "marketcap" 
//                     ? "bg-[#2E2E2E] text-[#2FD345]" 
//                     : "bg-[#171717] text-white hover:bg-[#262626]"}`}
//               >
//                 Market Cap
//               </button>
//             </div>
//           </div>

//           {/* Sort Dropdown */}
//           <div className="flex-shrink-0">
//             <Listbox value={sortBy} onChange={setSortBy}>
//               <div className="relative">
//                 <Listbox.Button className="flex items-center gap-2 px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg text-white hover:border-[#2FD345]/50 transition-all duration-200">
//                   <span className="text-sm whitespace-nowrap">
//                     {sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort by'}
//                   </span>
//                   <ChevronDownIcon className="w-4 h-4" />
//                 </Listbox.Button>
//                 <Listbox.Options className="absolute right-0 mt-2 w-56 bg-[#171717] border border-[#262626] rounded-lg py-1 shadow-lg z-10">
//                   {sortOptions.map((option) => (
//                     <Listbox.Option
//                       key={option.value}
//                       value={option.value}
//                       className={({ active, selected }) => `
//                         ${active ? 'bg-[#262626]' : ''}
//                         ${selected ? 'text-[#2FD345]' : 'text-white'}
//                         cursor-pointer select-none px-4 py-2 text-sm transition-colors
//                       `}
//                     >
//                       {option.label}
//                     </Listbox.Option>
//                   ))}
//                 </Listbox.Options>
//               </div>
//             </Listbox>
//           </div>
//         </div>

//         {/* Content */}
//         <div className="py-6">
//           {isLoading ? (
//             renderSkeletons()
//           ) : view === "grid" ? (
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
//               {tokens.map(({ mint, name, image, marketCapUSD, ticker }) => (
//                 <div key={mint} className="flex justify-center">
//                   <AgentCard
//                     name={name}
//                     image={image}
//                     ticker={ticker}
//                     mint={mint}
//                     marketCapUSD={marketCapUSD}
//                     onClick={() => router.push(`/coin/${mint}`)}
//                   />
//                 </div>
//               ))}
//             </div>
//           ) : (
//             <div className="flex flex-col gap-4">
//               <div className={`flex items-center w-full h-[20px] ${dmMono.className} text-[14px] leading-5 tracking-[2px] uppercase text-[#A6A6A6]`}>
//                 <div className="w-[596px]">AI AGENTS</div>
//                 <div className="flex flex-1 items-center">
//                   <div className="flex-1 flex items-center gap-1">Market Cap</div>
//                   <div className="flex-1 flex items-center gap-1">24h Volume</div>
//                   <div className="flex-1 flex items-center gap-1">Holders Count</div>
//                   <div className="flex-1 flex items-center gap-1">Bonding curve</div>
//                   <div className="w-[200px] flex justify-end">Creation time</div>
//                 </div>
//               </div>

//               {tokens.map(({
//                 mint,
//                 name,
//                 image,
//                 marketCapUSD,
//                 ticker,
//                 liquidity,
//                 holderCount,
//                 numComments,
//               }) => (
//                 <div 
//                   key={mint}
//                   onClick={() => router.push(`/coin/${mint}`)}
//                   className="flex w-full h-[74px] bg-[#171717] border border-[#262626] rounded-[6px] cursor-pointer hover:border-[#2FD345]/50 transition-colors"
//                 >
//                   <div className="flex items-center gap-4 px-4 w-[596px]">
//                     <div 
//                       className="w-[50px] h-[50px] rounded-lg bg-cover bg-center"
//                       style={{ 
//                         backgroundImage: `url(${image}), url(/Checker.png)`,
//                         backgroundBlendMode: 'normal, multiply'
//                       }}
//                     />
//                     <div className="flex flex-col gap-1">
//                       <div className="flex items-center gap-2">
//                         <span className={`${dmMono.className} text-base font-medium text-white`}>{name}</span>
//                         <span className={`${dmMono.className} text-base font-normal text-[#8C8C8C] tracking-[2px] uppercase`}>${ticker}</span>
//                       </div>
//                       <div className="flex items-center gap-2">
//                         <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>
//                           {mint.slice(0, 6)}...{mint.slice(-4)}
//                         </span>
//                         <button 
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             navigator.clipboard.writeText(mint);
//                           }}
//                           className="text-[#8C8C8C] hover:text-white transition-colors"
//                         >
//                           <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
//                             <path d="M10.5 10.5H13.5V2.5H5.5V5.5M2.5 5.5H10.5V13.5H2.5V5.5Z"/>
//                           </svg>
//                         </button>
//                       </div>
//                     </div>
//                   </div>

//                   <div className="flex flex-1 items-center px-4">
//                     <div className="flex-1">
//                       <span className={`${dmMono.className} text-base text-[#2FD345]`}>
//                         {Intl.NumberFormat("en-US", {
//                           style: "currency",
//                           currency: "USD",
//                           notation: "compact",
//                         }).format(Number(marketCapUSD))}
//                       </span>
//                     </div>
//                     <div className="flex-1">
//                       <span className={`${dmMono.className} text-base text-white`}>
//                         {Intl.NumberFormat("en-US", {
//                           style: "currency",
//                           currency: "USD",
//                           notation: "compact",
//                         }).format(Number(liquidity))}
//                       </span>
//                     </div>
//                     <div className="flex-1">
//                       <span className={`${dmMono.className} text-base text-white`}>{holderCount}</span>
//                     </div>
//                     <div className="flex-1">
//                       <div className="flex items-center gap-2">
//                         <div className="relative w-[161px] h-2">
//                           <div className="absolute w-full h-2 bg-[#2E2E2E] rounded-full" />
//                           <div 
//                             className="absolute h-2 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
//                             style={{ width: '28%' }}
//                           />
//                         </div>
//                         <span className={`${dmMono.className} text-sm text-white`}>28%</span>
//                       </div>
//                     </div>
//                     <div className="w-[200px] flex justify-end">
//                       <span className={`${dmMono.className} text-base text-white`}>16 mins Ago</span>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Pagination */}
//         <div className="flex justify-center py-6">
//           <Paginator
//             currentPage={currentPage}
//             hasPreviousPage={hasPreviousPage}
//             hasNextPage={hasNextPage}
//             previousPage={previousPage}
//             nextPage={nextPage}
//           />
//         </div>
//       </div>
//     </div>
//   );
// }

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// const styles = `
// .grid-icon {
//   background-image: url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7.5 17.5H12.5C17.5 17.5 19.5 15.5833 19.5 10.7917V5.04167C19.5 0.25 17.5 -1.66667 12.5 -1.66667H7.5C2.5 -1.66667 0.5 0.25 0.5 5.04167V10.7917C0.5 15.5833 2.5 17.5 7.5 17.5Z' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M0.529846 4.5625H20.4998' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M0.529846 11.2708H20.4998' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M7.00977 17.4904V-1.65723' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M14.0098 17.4904V-1.65723' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
//   background-repeat: no-repeat;
//   background-position: center;
// }

// @keyframes progress {
//   from { stroke-dashoffset: 100; }
//   to { stroke-dashoffset: 0; }
// }
// `;
