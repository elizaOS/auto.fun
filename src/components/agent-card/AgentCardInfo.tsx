import { Copy } from "lucide-react";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PlaceholderImage } from "../common/PlaceholderImage";

const AgentIcon = () => {
  return (
    <svg
      width="22"
      height="24"
      viewBox="0 0 22 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2392_2179)">
        <path
          d="M9.42783 9.80244H5.62967C5.59707 9.80244 5.28083 10.2757 5.20585 10.2595C5.15368 10.2464 4.77876 9.4401 4.70703 9.33564C5.31669 8.21598 5.89701 7.0768 6.51971 5.96039C6.55557 5.89837 6.9142 5.23573 6.95006 5.26511L9.42783 9.80244Z"
          fill="white"
        />
        <path
          d="M6.55859 22.3374L0.836914 19.0078L1.79868 17.6499H1.86388L2.99192 18.3844C4.058 19.566 5.16648 20.715 6.21953 21.9098C6.25213 21.9456 6.58141 22.3145 6.56185 22.3341L6.55859 22.3374Z"
          fill="white"
        />
        <path
          d="M7.86269 10.7817C7.52366 11.2909 7.23351 11.8622 6.87812 12.3583C6.58796 12.7631 6.21956 13.1483 5.90658 13.54C5.8805 13.5693 5.87723 13.6183 5.87398 13.6216C5.8642 13.6281 5.67836 13.527 5.67836 13.5073C5.67836 13.4551 6.26846 12.8349 6.34345 12.7076C6.37605 12.6489 6.40539 12.6031 6.39235 12.5313L5.51535 10.8926L5.47949 10.749C5.47949 10.749 5.52188 10.7817 5.5284 10.7817H7.86269Z"
          fill="white"
        />
        <path
          d="M21.3631 13.9349L20.2546 10.1418C20.2481 10.1027 20.2676 10.0733 20.2774 10.0407C20.4078 9.63916 20.8121 9.12992 20.9229 8.72514C20.936 8.67947 20.9425 8.64025 20.9229 8.59459C20.4535 7.31823 20.0655 5.96684 19.4982 4.73295C19.0744 3.81243 18.3049 2.63077 17.4475 2.08563C15.3545 0.76361 11.7096 -0.101422 9.24811 0.00956288C8.48844 0.0422055 6.09547 0.368632 5.58687 0.913762L1.479 6.82535L1.49204 6.92981C2.32013 8.37259 3.1841 9.79585 3.99262 11.2517C4.08391 11.4149 4.47188 12.0514 4.4784 12.1722C4.49144 12.355 4.34147 13.4943 4.28931 13.6803C4.1915 14.0132 3.62422 14.8456 3.41557 15.1884C2.98848 15.8869 2.53205 16.5692 2.08214 17.2481V17.3461C2.42121 17.5648 2.83525 17.7606 3.15801 17.9989C3.51012 18.2568 3.75789 18.6714 4.09043 18.9586L11.3575 23.9399L11.0477 21.3937L7.57234 19.9444C7.31478 19.778 7.15178 19.5331 7.11917 19.223C7.03115 18.4364 7.02789 17.5713 6.98877 16.7748C6.95942 16.233 6.97572 15.6062 6.92356 15.0774C6.904 14.875 6.85836 14.7999 6.70512 14.6759C6.50299 14.5062 5.15001 13.7325 5.13044 13.6411L5.8966 12.6782L5.90637 12.6064L3.39927 7.92865L7.37345 1.80491L14.6112 14.6824L16.4695 10.8926L17.4443 11.1113L17.6758 12.528L15.9022 16.7193L12.1464 14.6204L10.0175 10.7947L8.32543 10.7849L7.4224 12.3452L6.13459 13.8011C6.12481 13.8598 6.15741 13.8435 6.17697 13.8598C6.51277 14.1536 7.16484 14.3201 7.28219 14.8065C7.32457 14.986 7.33108 15.2961 7.34415 15.4952C7.41912 16.6998 7.35716 18.0675 7.53975 19.2491C7.56583 19.4221 7.70276 19.5429 7.84948 19.6245L11.1553 20.9988L12.8669 18.1001C14.3666 18.753 15.8239 19.4939 17.2845 20.2317C17.353 20.2578 17.4214 20.248 17.4932 20.2448C17.6203 20.2349 18.2431 20.1239 18.3376 20.0783C18.3702 20.0619 18.3898 20.0456 18.4028 20.013L18.8494 18.6322L18.5625 17.5321C18.618 17.3134 19.1917 16.7846 19.208 16.641C19.2146 16.5822 19.169 16.3439 19.1396 16.2884C19.0907 16.1905 18.9733 16.1514 18.882 16.1056C18.8527 16.0796 18.8755 16.0665 18.9473 16.073C18.9994 16.0796 19.2602 16.1252 19.2733 16.1219C19.3841 16.0796 19.6971 15.6454 19.8275 15.5572C19.8536 15.208 19.7818 14.8554 19.7753 14.5062C19.9644 14.3853 21.2848 14.1047 21.3435 14.0198C21.3598 13.9969 21.3631 13.9676 21.3598 13.9382L21.3631 13.9349ZM8.0255 15.0709L8.31893 12.3844H8.93838L9.17314 14.4637L10.663 15.1068L10.0599 16.1317L8.01899 15.0676L8.0255 15.0709ZM15.1328 18.877L10.4381 16.2166C10.4381 16.2166 10.412 16.1937 10.4088 16.1807C10.3794 16.0861 10.7674 15.5312 10.7967 15.3875C10.826 15.3647 10.9695 15.4919 11.0053 15.5181C12.3616 16.5431 13.8809 17.7378 15.1621 18.8476C15.2045 18.8933 15.1882 18.9097 15.1295 18.8803L15.1328 18.877ZM17.8061 7.84377V8.43139L16.5999 8.34973L16.8965 7.71651L17.8061 7.84377ZM14.6112 12.9034C14.6112 12.9034 14.5296 12.9099 14.5394 12.861L13.2777 10.5042L14.5981 7.51737V7.45206L10.8945 0.205418C10.9173 0.182569 11.126 0.358839 11.1553 0.384953C11.452 0.642827 11.7291 0.975783 12.0193 1.24998C13.1767 2.35657 14.3568 3.43704 15.5045 4.55015C15.9902 5.41518 16.388 6.32589 16.8216 7.21705L16.8118 7.35739L14.6112 12.9067V12.9034ZM16.551 8.72514C16.8835 8.66312 17.3888 8.81981 17.7409 8.79044C17.7116 8.83939 17.6334 8.84918 17.5128 8.8231C17.1672 8.8296 16.8151 8.81981 16.4695 8.8231C16.4597 8.76107 16.4955 8.73493 16.551 8.72514ZM18.0996 9.34535C18.0735 9.58036 18.0768 9.85131 18.0344 10.0798C18.0279 10.1092 18.0148 10.1581 17.9855 10.1614C17.9203 10.1745 17.0954 9.74034 16.9618 9.68482L16.7009 9.18215C17.1574 9.30619 17.6301 9.34535 18.1028 9.34535H18.0996ZM16.7303 10.749V10.292L18.1648 10.8143L16.7303 10.749ZM18.4452 10.3246C18.4126 10.2822 18.2756 10.2822 18.2626 10.2398C18.2431 10.1549 18.318 9.7795 18.331 9.65545C18.3408 9.56406 18.3278 9.46939 18.331 9.378H18.5267C18.5071 9.46611 18.5006 10.3377 18.4452 10.3246ZM18.882 8.69248C18.8136 8.6664 18.4582 8.64025 18.4582 8.57823V7.97438C18.5299 7.98417 18.882 8.12779 18.882 8.18653V8.69248Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="clip0_2392_2179">
          <rect
            width="20.5263"
            height="24"
            fill="white"
            transform="translate(0.836914)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

const WebsiteIcon = () => {
  return (
    <svg
      width="25"
      height="24"
      viewBox="0 0 25 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_1942_1265)">
        <path
          d="M24.043 11.9998C24.043 14.9551 22.8691 17.7893 20.7794 19.879C18.6897 21.9687 15.8555 23.1426 12.9002 23.1426C9.94491 23.1426 7.11068 21.9687 5.02099 19.879C2.9313 17.7893 1.75732 14.9551 1.75732 11.9998M24.043 11.9998C24.043 9.04452 22.8691 6.21029 20.7794 4.1206C18.6897 2.03091 15.8555 0.856934 12.9002 0.856934C9.94491 0.856934 7.11068 2.03091 5.02099 4.1206C2.9313 6.21029 1.75732 9.04452 1.75732 11.9998M24.043 11.9998H1.75732"
          stroke="white"
          strokeWidth="1.84274"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.1862 11.9998C16.9757 16.0746 15.4748 19.977 12.9005 23.1426C10.3262 19.977 8.82526 16.0746 8.61475 11.9998C8.82526 7.92495 10.3262 4.02262 12.9005 0.856934C15.4748 4.02262 16.9757 7.92495 17.1862 11.9998Z"
          stroke="white"
          strokeWidth="1.84274"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_1942_1265">
          <rect
            width="24"
            height="24"
            fill="white"
            transform="translate(0.899902)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

interface AgentCardInfoProps {
  name: string;
  ticker: string;
  image: string;
  description: string;
  curveProgress: number;
  mint: string;
  tokenPriceUSD?: number;
  solPriceUSD?: number;
  socialLinks?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    agentLink?: string;
  };
  agentName?: string;
  reserveLamport: number;
  virtualReserves: number;
  placeholderTargetMarketCap?: number;
  className?: string;
}

export function AgentCardInfo({
  name,
  ticker,
  image,
  curveProgress,
  mint,
  solPriceUSD = 0,
  tokenPriceUSD = 0,
  socialLinks,
  description,
  agentName,
  reserveLamport,
  virtualReserves,
  placeholderTargetMarketCap,
  className,
}: AgentCardInfoProps) {
  const [copied, setCopied] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // Graduation market cap is the market cap at which the token will graduate to Raydium
  // This is the market cap at which the token will have 100% of the bonding curve
  const finalTokenPrice = 0.00000045; // Approximated value from the bonding curve configuration
  const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
  const graduationMarketCap =
    placeholderTargetMarketCap ?? finalTokenUSDPrice * 1_000_000_000;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const formatNumber = (num: number, decimals: number) => {
    return isNaN(num) ? "0" : num.toFixed(decimals);
  };

  const truncateDescription = (text: string) => {
    if (text.length <= 100) return text;
    return showFullDescription ? text : text.split("...")[0] + "...";
  };

  const socialLinkData = [
    {
      icon: <WebsiteIcon />,
      link: socialLinks?.website,
    },
    {
      icon: <Icon icon="ri:twitter-x-fill" width="24" height="24" />,
      link: socialLinks?.twitter,
    },
    {
      icon: <Icon icon="ic:baseline-telegram" width="24" height="24" />,
      link: socialLinks?.telegram,
    },
    {
      icon: <Icon icon="ic:baseline-discord" width="24" height="24" />,
      link: socialLinks?.discord,
    },
    { icon: <AgentIcon />, link: socialLinks?.agentLink },
  ].filter(({ link }) => !!link);

  return (
    <div
      className={`flex flex-col justify-center items-start p-4 gap-6 bg-[#171717] border border-[#262626] rounded-[6px] ${className}`}
    >
      <div className="flex flex-row items-start gap-5">
        <div className="flex flex-col justify-center items-start w-[144px] h-[144px]">
          {image ? (
            <img
              src={image}
              alt={name}
              className="w-[144px] h-[144px] rounded-[4px] border border-[#262626] object-cover"
            />
          ) : (
            <PlaceholderImage />
          )}
        </div>

        {/* Product Details */}
        <div className="flex flex-col items-start gap-4 flex-1">
          {/* Title Section */}
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-row items-center gap-2">
              <h1 className="font-satoshi text-[32px] leading-9 tracking-[-0.014em] text-white font-medium">
                {name}
              </h1>
              <span
                className={`text-[18px] leading-6 tracking-[2px] uppercase text-[#8C8C8C]`}
              >
                ${ticker}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {agentName && (
                <div className="flex flex-row items-start gap-1">
                  <span
                    className={`text-xs leading-4 tracking-[2px] uppercase text-white`}
                  >
                    AGENT:
                  </span>
                  <a
                    href="" // TODO: figure out the link between agentLink for external agents and agents from our system. maybe unify the link in the backend data structure
                    className={`text-xs leading-4 tracking-[2px] uppercase text-[#2FD345] underline`}
                  >
                    {agentName}
                  </a>
                </div>
              )}
              {/* Description */}
              <div className="font-satoshi text-base leading-6 tracking-[-0.4px] text-[#8C8C8C] mt-2">
                <p>{truncateDescription(description)}</p>
                {description.length > 100 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="text-[#2FD345] hover:text-[#2FD345]/80 transition-colors ml-1"
                  >
                    {showFullDescription ? "See Less" : "See More"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Address */}
      <div className="flex w-full h-10 border border-[#262626] rounded-[6px]">
        <div className="flex items-center px-3 h-10 bg-[#2E2E2E] border-r border-[#262626] rounded-l-[6px]">
          <span
            className={`text-base leading-6 tracking-[2px] uppercase text-[#8C8C8C]`}
          >
            CA
          </span>
        </div>
        <div className="flex flex-1 items-center justify-between px-3 h-10 bg-[#212121] rounded-r-[6px]">
          <span className={`text-base leading-6 text-[#8C8C8C]`}>
            {mint.slice(0, 4)}...{mint.slice(-4)}
          </span>
          <button
            onClick={() => handleCopy(mint)}
            className="text-[#8C8C8C] hover:text-white transition-colors"
          >
            {copied ? (
              <span className="text-[#2FD345]">Copied!</span>
            ) : (
              <Copy className="w-[18px] h-[18px]" />
            )}
          </button>
        </div>
      </div>

      {/* TODO: placeholders for now */}
      {/* Social Links */}
      {socialLinkData.length > 0 && (
        <div className="flex w-full gap-0.5">
          {socialLinkData.map((item, index, arr) => (
            <a
              key={index}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex justify-center items-center h-10 bg-[#212121] border border-[#262626] flex-1
              ${index === 0 ? "rounded-l-[6px]" : ""} 
              ${index === arr.length - 1 ? "rounded-r-[6px]" : ""}
              ${item.link === "#" ? "opacity-50 cursor-not-allowed" : "hover:bg-[#2FD345] hover:text-black"}
              text-white transition-colors`}
              onClick={
                item.link === "#" ? (e) => e.preventDefault() : undefined
              }
            >
              {item.icon}
            </a>
          ))}
        </div>
      )}

      {/* Price Information */}
      <div className="flex h-[72px] gap-0.5">
        <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-l-[6px]">
          <span className={`text-base leading-6 text-[#8C8C8C]`}>
            Price USD
          </span>
          <span
            className={`text-xl leading-6 tracking-[2px] uppercase text-white whitespace-nowrap`}
          >
            ${formatNumber(tokenPriceUSD, 8)}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-r-[6px]">
          <span className={`text-base leading-6 text-[#8C8C8C]`}>Price</span>
          <span
            className={`text-xl leading-6 tracking-[2px] uppercase text-white whitespace-nowrap`}
          >
            {formatNumber(tokenPriceUSD / solPriceUSD, 6)} SOL
          </span>
        </div>
      </div>

      {/* Bonding Curve Progress */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="font-satoshi text-xl leading-7 tracking-[-0.014em] text-white font-medium">
              Bonding curve progress:
            </span>
            <span className="font-geist text-xl leading-7 text-[#2FD345]">
              {curveProgress >= 100
                ? "Complete"
                : `${Math.min(100, curveProgress).toFixed(0)}%`}
            </span>
          </div>
          <div className="relative group">
            <Icon
              icon="mingcute:information-line"
              className="w-5 h-5 text-[#8C8C8C] hover:text-white transition-colors"
            />
            <div className="absolute bottom-full right-0 mb-2 w-[300px] px-4 py-3 bg-[#262626] rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-[#404040]">
              When the market cap reaches $100,000 liquidity will transition to
              Raydium. Trading fees are distributed to token owners rather than
              being burned.
            </div>
          </div>
        </div>
        <div className="relative w-full h-2">
          <div className="absolute w-full h-full bg-[#262626] rounded-[999px]" />
          <div
            className="absolute h-full bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-[999px]"
            style={{ width: `${Math.min(100, curveProgress)}%` }}
          />
        </div>
        <p className="font-satoshi text-base leading-5 text-[#8C8C8C] max-w-[390px]">
          {curveProgress >= 100 ? (
            <>
              Raydium pool has been seeded. View on Raydium{" "}
              <a href="#" className="text-[#2FD345] hover:underline">
                here
              </a>
            </>
          ) : (
            <>
              Graduate this coin to raydium at{" "}
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(graduationMarketCap)}{" "}
              market cap. there is{" "}
              {formatNumber(
                (reserveLamport - virtualReserves) / LAMPORTS_PER_SOL,
                3,
              )}{" "}
              SOL in the bonding curve.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
