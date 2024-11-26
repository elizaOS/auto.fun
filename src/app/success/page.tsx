"use client";

import { useSearchParams } from "next/navigation";

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const twitterHandle = searchParams.get("twitterHandle");
  const mintPublicKey = searchParams.get("mintPublicKey");

  if (!twitterHandle || !mintPublicKey) {
    throw new Error(
      'Missing "twitterHandle" or "mintPublicKey" in query params',
    );
  }

  return (
    <div className="flex flex-1 justify-center items-center">
      <div className="relative flex flex-col items-center">
        <div className="h-[244px] p-6 rounded-[20px] border border-[#03ff24] flex-col justify-start items-center gap-6 inline-flex">
          <div className="flex-col justify-start items-center gap-3 flex">
            <svg
              width="41"
              height="40"
              viewBox="0 0 41 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M28.8334 5.56665C31.3472 7.01808 33.4383 9.10086 34.8997 11.6088C36.3612 14.1168 37.1423 16.9629 37.1658 19.8655C37.1892 22.7682 36.4542 25.6266 35.0334 28.1578C33.6127 30.6891 31.5554 32.8053 29.0654 34.2972C26.5754 35.789 23.739 36.6047 20.8369 36.6634C17.9348 36.7222 15.0676 36.0219 12.5193 34.6321C9.97097 33.2422 7.82983 31.2109 6.30782 28.7392C4.78581 26.2675 3.93572 23.4412 3.84171 20.54L3.83337 20L3.84171 19.46C3.93505 16.5816 4.77262 13.7766 6.27277 11.3183C7.77293 8.86002 9.88446 6.8324 12.4015 5.43312C14.9186 4.03384 17.7553 3.31064 20.6351 3.33405C23.5148 3.35745 26.3394 4.12665 28.8334 5.56665ZM26.6784 15.4883C26.3914 15.2014 26.0096 15.029 25.6045 15.0035C25.1995 14.978 24.799 15.1012 24.4784 15.35L24.3217 15.4883L18.8334 20.975L16.6784 18.8216L16.5217 18.6833C16.201 18.4347 15.8007 18.3117 15.3957 18.3372C14.9908 18.3628 14.6091 18.5352 14.3221 18.8221C14.0352 19.109 13.8628 19.4907 13.8373 19.8957C13.8117 20.3006 13.9348 20.701 14.1834 21.0216L14.3217 21.1783L17.655 24.5116L17.8117 24.65C18.104 24.8768 18.4634 24.9998 18.8334 24.9998C19.2033 24.9998 19.5628 24.8768 19.855 24.65L20.0117 24.5116L26.6784 17.845L26.8167 17.6883C27.0655 17.3676 27.1887 16.9672 27.1632 16.5622C27.1377 16.1571 26.9653 15.7753 26.6784 15.4883Z"
                fill="#03FF24"
              />
            </svg>

            <div className="text-[#03ff24] text-base font-medium leading-tight">
              AI Agent created
            </div>
          </div>
          <div className="flex-col justify-start items-start gap-3 flex">
            <a
              href={`https://pump.fun/coin/${mintPublicKey}`}
              target="_blank"
              className="self-stretch p-3 bg-[#03ff24] rounded-xl justify-center items-center gap-2 inline-flex"
            >
              <div className="text-black text-base leading-tight">
                View token on pump.fun
              </div>
            </a>
            <a
              href={`https://x.com/${twitterHandle}`}
              target="_blank"
              className="self-stretch p-3 bg-[#002605] rounded-xl border border-[#01c167] justify-center items-center gap-2 inline-flex"
            >
              <div className="text-[#03FF24] text-base leading-tight">
                View AI Agent on Twitter
              </div>
            </a>
          </div>
        </div>
        <div className="absolute -bottom-[100px] text-[#03FF24] text-sm text-center w-[380px] font-medium">
          token launch takes 1-3 minutes. agent takes ~10 minutes to tweet
        </div>
      </div>
    </div>
  );
}
