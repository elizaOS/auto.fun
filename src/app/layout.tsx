import type { Metadata } from "next";
import { DM_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const dmMono = DM_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "serlaunchalot",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${dmMono.className} antialiased h-full flex flex-col sm:gap-16`}
      >
        <SkeletonTheme baseColor="#002605" highlightColor="#008011">
          <Providers>
            <Nav />
            <div className="flex flex-col flex-1">{children}</div>
          </Providers>
          <ToastContainer autoClose={5000} theme="dark" />
        </SkeletonTheme>
      </body>
    </html>
  );
}
