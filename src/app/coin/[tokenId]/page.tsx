"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoIcon, SendHorizontal, Copy, Check } from "lucide-react";
import { useToken } from "@/utils/tokens";
import { useParams } from "next/navigation";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import Skeleton from "react-loading-skeleton";
import { TokenBuySell } from "./swap/TokenBuySell";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Comments } from "./Comments";

// Import Fal AI client
import { fal } from "@fal-ai/client";
import { TradeTable } from "@/components/TradeTable";
import { Toast } from "@/components/common/Toast";
import { toast } from "react-toastify";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export default function TradingInterface() {
  const [activeTab, setActiveTab] = useState("comments");
  const params = useParams();

  const tokenId = params.tokenId as string;
  const { data: token, isLoading } = useToken({ variables: tokenId });
  const [copied, setCopied] = useState(false);

  const { items: holders } = usePaginatedLiveData({
    itemsPerPage: 100,
    endpoint: `/tokens/${tokenId}/holders`,
    validationSchema: HolderSchema,
    getUniqueId: (holder) => holder.address,
    socketConfig: {
      subscribeEvent: {
        event: "subscribe",
        args: [tokenId],
      },
      newDataEvent: "newHolder",
    },
    itemsPropertyName: "holders",
  });

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    console.log("subscribe", tokenId);
    socket.emit("subscribe", tokenId);
  }, [tokenId, socket]);

  useEffect(() => {
    if (!token) return;

    socket.on("updateToken", (token) => {
      console.log("updateToken", token);
      queryClient.setQueryData(useToken.getKey(tokenId), token);
    });

    return () => {
      socket.off("updateToken");
    };
  }, [token, tokenId, socket]);

  if (isLoading) {
    return renderSkeletons();
  }

  if (!token) return null;

  const messages = [
    {
      id: "1",
      address: "0x742...3ab",
      content: "This agent is performing really well!",
      timestamp: "(2 min ago)",
      role: "USER",
    },
    {
      id: "2",
      address: "0x123...def",
      content: "Agreed, the market cap is growing steadily",
      timestamp: "(1 min ago)",
      role: "ASSISTANT",
    },
  ];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast(
      <Toast message="Address copied to clipboard" status="completed" />,
      {
        position: "bottom-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: false,
        progress: undefined,
      }
    );
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen text-gray-200 flex flex-col mt-12">
      <div className="flex flex-col lg:flex-row gap-4 justify-center">
        <div className="flex flex-col space-y-4 flex-1 max-w-[960px]">
          {/* Header Profile */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-8">
            <div className="flex items-start gap-6 flex-col md:flex-row items-stretch">
              <img
                src={token.image}
                alt="AI Agent Profile"
                className="rounded-xl h-[150px] self-start"
              />
              <div className="flex-1 flex flex-col self-stretch gap-2">
                <div className="flex flex-col gap-2">
                  <h1 className="text-[#22C55E] font-bold text-xl md:text-2xl">
                    {token.name} (${token.ticker})
                  </h1>
                  <div className="flex items-center gap-1 text-gray-300 text-xs">
                    {`${token.mint.slice(0, 3)}...${token.mint.slice(-3)}`}
                    {copied ? (
                      <Check className="text-green-500 h-3" />
                    ) : (
                      <Copy
                        className="cursor-pointer text-gray-300 h-3 hover:text-gray-400"
                        onClick={() => handleCopy(token.mint)}
                      />
                    )}
                  </div>
                </div>
                <p className="text-[#a1a1a1] text-sm md:text-lg break-word">
                  {token.description}
                </p>
                <div className="flex gap-4 mt-6">
                  <div className="text-xs text-[#03FF24]">
                    <span className="text-gray-300">MC</span>{" "}
                    <b>
                      {Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        notation: "compact",
                      }).format(Number(token.marketCapUSD))}
                    </b>
                  </div>
                </div>
                <div className="flex gap-4 mt-6 flex-col md:flex-row">
                  {token.discord && (
                    <Link
                      href={token.discord}
                      className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                    >
                      {/* Discord SVG */}
                      Discord
                    </Link>
                  )}
                  {token.twitter && (
                    <Link
                      href={token.twitter}
                      className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                    >
                      {/* Twitter SVG */}
                      Twitter
                    </Link>
                  )}
                  {token.telegram && (
                    <Link
                      href={token.telegram}
                      className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                    >
                      {/* Telegram SVG */}
                      Telegram
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {token && token.status === "active" && <TradingChart param={token} />}

          {/* --- Fal Generator Section --- */}
          <FalGenerator />

          {/* Trades/Comments/Chat */}
          <div className="bg-[#171717] border border-[#262626] text-sm md:text-lg text-gray-400 rounded-xl p-4 md:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="gap-2 mb-10 flex justify-start overflow-x-scroll lg:overflow-hidden">
                <TabsTrigger
                  className={cn(
                    activeTab === "trades" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="trades"
                >
                  Trades
                </TabsTrigger>
                <TabsTrigger
                  className={cn(
                    activeTab === "comments" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="comments"
                >
                  Comments
                </TabsTrigger>
                <TabsTrigger
                  className={cn(
                    activeTab === "chat" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="chat"
                >
                  Agent Chat
                </TabsTrigger>
              </TabsList>

              <TabsContent className="mt-0" value="trades">
                <TradeTable tokenId={tokenId} />
              </TabsContent>

              <Comments tokenId={tokenId} />

              <TabsContent className="mt-0" value="chat">
                <div className="flex flex-col gap-4 h-[400px] overflow-y-scroll">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn([
                        "flex flex-col",
                        message.role === "USER" ? "items-end" : "items-start",
                      ])}
                    >
                      <div className="flex items-center gap-4 mb-2">
                        <span
                          className={cn("text-[#22C55E] font-bold", [
                            message.role === "USER" ? "text-white" : "",
                          ])}
                        >
                          {message.role === "USER" ? "You" : "AI"}
                        </span>
                        <span
                          className={cn("text-[#11632F] text-sm", [
                            message.role === "USER" ? "text-gray-400" : "",
                          ])}
                        >
                          {message.timestamp}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-[#a1a1a1] mb-3">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 bg-[#262626] border border-gray-700 rounded px-7 py-6 text-white !text-xl md:text-2xl rounded-lg"
                  />
                  <button className="text-[#22C55E] hover:text-[#45a049]">
                    <SendHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex flex-col space-y-4 md:max-w-[420px] 2xl:max-w-[480px]">
          <TokenBuySell tokenId={tokenId} />

          <div className="flex flex-col gap-2 bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
            <div className="flex justify-between items-center">
              <span className="text-[#22C55E] text-sm">
                Bonding curve progress: 2%
              </span>
              <InfoIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div className="w-full bg-[#333] rounded-full h-2 mt-2">
              <div
                className="bg-[#22C55E] h-2 rounded-full"
                style={{ width: "2%" }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Graduate this coin to Raydium at $87,140 market cap. There is
              0.382 SOL in the bonding curve.
            </p>
          </div>

          {/* Holder Distribution */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
            <h2 className="text-gray-200 mb-4">Holder Distribution</h2>

            <div className="space-y-2">
              {holders.map((holder, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-[#22C55E] text-sm">
                    {holder.address.slice(0, 4)}...
                    {holder.address.slice(-4)}
                  </span>
                  <span className="text-[#a1a1a1] text-sm">
                    {holder.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FalGenerator = () => {
  // possible types: "image", "music", "video"
  const [activeType, setActiveType] = useState<"image" | "music" | "video">(
    "image",
  );
  // Shared prompt for image/video
  const [prompt, setPrompt] = useState("");
  // Music-specific state fields for separate song parts
  const [verse1, setVerse1] = useState("");
  const [chorus, setChorus] = useState("");
  const [verse2, setVerse2] = useState("");
  const [bridge, setBridge] = useState("");
  const [verse3, setVerse3] = useState("");
  const [genres, setGenres] = useState("");

  const params = useParams();

  const tokenId = params.tokenId as string;
  const { data: token } = useToken({ variables: tokenId });

  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);

  // For now the Fal AI API key is pulled from env vars.
  const falApiKey = process.env.NEXT_PUBLIC_FAL_AI_API_KEY; // TODO: Remove this and replace with proxy / call to server
  // Initialize fal with the API key.
  fal.config({
    credentials: falApiKey,
  });

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (activeType === "image") {
        const res = await fal.subscribe("fal-ai/flux/schnell", {
          input: { prompt },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });
        setResult(res.data);
        //       } else if (activeType === "music") {
        //         // Compile the separate music parts into one lyrics string.
        //         const compiledLyrics = `[verse1]
        // ${verse1}

        // [chorus]
        // ${chorus}

        // [verse2]
        // ${verse2}

        // [bridge]
        // ${bridge}

        // [verse3]
        // ${verse3}`;
        //         const res = await fal.subscribe("fal-ai/yue", {
        //           input: { lyrics: compiledLyrics, genres },
        //           logs: true,
        //           onQueueUpdate: (update) => {
        //             if (update.status === "IN_PROGRESS") {
        //               update.logs.map((log) => log.message).forEach(console.log);
        //             }
        //           },
        //         });
        //         setResult(res.data);
      } else if (activeType === "video") {
        const res = await fal.subscribe("fal-ai/t2v-turbo", {
          input: { prompt },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });
        setResult(res.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Render the result differently based on activeType.
  const renderResult = () => {
    if (!result) return null;
    if (activeType === "image" && result.images && result.images.length > 0) {
      const image = result.images[0];
      return (
        <div className="flex flex-col items-center">
          <img
            src={image.url}
            alt={prompt || "Generated Image"}
            className="max-w-full rounded"
          />
          <a
            href={image.url}
            download="generated-image.png"
            className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download Image
          </a>
        </div>
      );
    }
    // else if (activeType === "music" && result.audio && result.audio.length > 0) {
    //   const audio = result.audio[0];
    //   return (
    //     <div className="flex flex-col items-center">
    //       <audio controls src={audio.url} className="w-full" />
    //       <a
    //         href={audio.url}
    //         download="generated-music.mp3"
    //         className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
    //       >
    //         Download Music
    //       </a>
    //     </div>
    //   );
    // }
    else if (activeType === "video" && result.video) {
      // Video result is returned as an object rather than an array.
      const videoData = result.video;
      return (
        <div className="flex flex-col items-center">
          <video controls src={videoData.url} className="max-w-full" />
          <a
            href={videoData.url}
            download={videoData.file_name || "generated-video.mp4"}
            className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download Video
          </a>
        </div>
      );
    } else {
      // Fallback: show the raw JSON if no expected media is returned.
      return (
        <pre className="text-white">{JSON.stringify(result, null, 2)}</pre>
      );
    }
  };

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6 mt-6">
      <h2 className="text-white text-xl mb-4">
        Generate ${token?.name} Content
      </h2>
      <div className="flex gap-4 mb-4">
        <button
          className={cn(
            "px-4 py-2 rounded",
            activeType === "image"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300",
          )}
          onClick={() => setActiveType("image")}
        >
          Image
        </button>
        {/* <button
          className={cn(
            "px-4 py-2 rounded",
            activeType === "music"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300"
          )}
          onClick={() => setActiveType("music")}
        >
          Music
        </button> */}
        <button
          className={cn(
            "px-4 py-2 rounded",
            activeType === "video"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300",
          )}
          onClick={() => setActiveType("video")}
        >
          Video
        </button>
      </div>
      <div>
        {activeType === "image" && (
          <div className="flex flex-col gap-2">
            <label className="text-white">Image Prompt</label>
            <input
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter image prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        )}
        {activeType === "music" && (
          <div className="flex flex-col gap-2">
            <label className="text-white">Verse 1</label>
            <textarea
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter Verse 1"
              value={verse1}
              onChange={(e) => setVerse1(e.target.value)}
            />
            <label className="text-white">Chorus</label>
            <textarea
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter Chorus"
              value={chorus}
              onChange={(e) => setChorus(e.target.value)}
            />
            <label className="text-white">Verse 2</label>
            <textarea
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter Verse 2"
              value={verse2}
              onChange={(e) => setVerse2(e.target.value)}
            />
            <label className="text-white">Bridge</label>
            <textarea
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter Bridge"
              value={bridge}
              onChange={(e) => setBridge(e.target.value)}
            />
            <label className="text-white">Verse 3</label>
            <textarea
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter Verse 3"
              value={verse3}
              onChange={(e) => setVerse3(e.target.value)}
            />
            <label className="text-white">Genres</label>
            <input
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter genres"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
            />
          </div>
        )}
        {activeType === "video" && (
          <div className="flex flex-col gap-2">
            <label className="text-white">Video Prompt</label>
            <input
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Enter video prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        )}
      </div>
      <button
        onClick={handleGenerate}
        className="mt-4 px-4 py-2 bg-[#22C55E] text-white rounded hover:bg-[#1aab45]"
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate"}
      </button>
      {result && (
        <div className="mt-4">
          <h3 className="text-white">Result:</h3>
          {renderResult()}
        </div>
      )}
    </div>
  );
};

const renderSkeletons = () => (
  <div className="min-h-screen text-green-500 relative overflow-hidden">
    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
    <div className="relative z-10">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/50 border border-green-500/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center relative overflow-hidden group">
              <Skeleton
                width={64}
                height={64}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="rounded-full"
              />
            </div>
            <div>
              <Skeleton
                width={150}
                height={24}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="mb-2"
              />
              <Skeleton
                width={100}
                height={16}
                baseColor="#171717"
                highlightColor="#00ff0026"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton
              width={32}
              height={32}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-full"
            />
            <Skeleton
              width={32}
              height={32}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton
              width="100%"
              height={300}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-xl"
            />
            <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="text-center p-4 border border-green-500/20 rounded-xl relative overflow-hidden group"
                    >
                      <Skeleton
                        width={80}
                        height={24}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                        className="mb-2"
                      />
                      <Skeleton
                        width={60}
                        height={16}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Token Buy/Sell */}</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton
                  width="100%"
                  height={50}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl mb-4"
                />
                <Skeleton
                  width="100%"
                  height={50}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl"
                />
              </CardContent>
            </Card>

            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Bonding Status */}</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton
                  width="100%"
                  height={20}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl mb-2"
                />
                <Skeleton
                  width="100%"
                  height={10}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl"
                />
              </CardContent>
            </Card>
            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Holder Distribution */}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-green-500">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <Skeleton
                          width={50}
                          height={16}
                          baseColor="#171717"
                          highlightColor="#00ff0026"
                        />
                        <Skeleton
                          width={30}
                          height={16}
                          baseColor="#171717"
                          highlightColor="#00ff0026"
                        />
                      </div>
                      <Skeleton
                        width="100%"
                        height={4}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                        className="rounded"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  </div>
);
