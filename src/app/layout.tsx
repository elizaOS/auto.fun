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
import { Suspense } from "react";
import { Footer, FooterSkeleton } from "@/components/common/Footer";

const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.ttf",
  variable: "--font-satoshi",
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
        className={`${inter.className} ${satoshi.variable} ${inter.variable} font-mono antialiased flex flex-col body-padding-x pt-[83px] min-h-screen`}
      >
        <SkeletonTheme baseColor="#002605" highlightColor="#008011">
          <Providers>
            <Nav />
            <div className="flex flex-col flex-1">{children}</div>
          </Providers>
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar
            newestOnTop={false}
            closeOnClick={true}
            rtl={false}
            pauseOnFocusLoss
            draggable={false}
            pauseOnHover
            theme="dark"
            closeButton={true}
            toastClassName="border border-[#262626]"
          />
        </SkeletonTheme>
        <Suspense fallback={<FooterSkeleton />}>
          <Footer />
        </Suspense>
      </body>
    </html>
  );
}
