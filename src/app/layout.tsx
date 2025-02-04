import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";

const ppMondwest = localFont({
  src: "./fonts/PPMondwest-Regular.otf",
  variable: "--font-pp-mondwest",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Auto.fun",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.className} ${ppMondwest.variable} ${inter.variable} font-mono antialiased flex flex-col sm:gap-16 body-padding-x pt-[83px]`}
      >
        <SkeletonTheme baseColor="#002605" highlightColor="#008011">
          <Providers>
            <Nav />
            <div className="flex flex-col flex-1">{children}</div>
          </Providers>
          <ToastContainer
            position="bottom-right"
            autoClose={false}
            className="!w-[277px]"
            toastClassName={"!bg-transparent !rounded-none !mb-4 !p-0"}
            bodyClassName={"!p-0 !m-0"}
            closeButton={false}
          />
        </SkeletonTheme>

        <div className="flex-col justify-center items-center inline-flex overflow-hidden pt-12">
          <div className="self-stretch justify-between items-center inline-flex">
            <div className="justify-start items-center gap-6 flex">
              <Image
                height={40}
                width={40}
                src="/logo_rounded_25percent.png"
                alt="logo"
              />
            </div>
            <div className="justify-center items-center gap-8 flex">
              <div className="justify-start items-center gap-2.5 flex">
                <div className="text-center text-[#d1d1d1] text-base font-medium leading-normal">
                  ©2024 Auto.fun
                </div>
                <div className="w-10 h-10 p-2.5 rounded-lg border border-[#f1f1f1] justify-center items-center gap-2 flex">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 16 14"
                  >
                    <path
                      fill="#fff"
                      d="M12.218.27h2.249L9.553 5.885l5.78 7.642h-4.525L7.263 8.892l-4.056 4.635H.957L6.211 7.52.667.27h4.64l3.205 4.236zm-.79 11.91h1.246L4.63 1.546H3.293z"
                    ></path>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
