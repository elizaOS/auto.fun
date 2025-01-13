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
        className={`${inter.className} ${ppMondwest.variable} ${inter.variable} antialiased flex flex-col sm:gap-16 px-8 pt-[83px] pb-12`}
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
      </body>
    </html>
  );
}
