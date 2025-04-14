import Image from "next/image";
import Link from "next/link";
import { Fragment, PropsWithChildren } from "react";

const FooterItem = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <span
    className={`text-[#8C8C8C] transition-colors duration-200 font-mono text-sm ${className}`}
  >
    {children}
  </span>
);

const FooterLink = ({
  href,
  children,
}: PropsWithChildren<{ href: string }>) => {
  return (
    <Link href={href}>
      <FooterItem className="hover:text-white">{children}</FooterItem>
    </Link>
  );
};

const links: { name: string; href: string }[] = [
  { name: "Privacy Policy", href: "/legal/privacy" },
  { name: "Terms of Service", href: "/legal/terms" },
  { name: "Fees", href: "/legal/fees" },
];

export const Footer = () => {
  return (
    <div className="flex-col justify-center items-center inline-flex overflow-hidden py-3.5 mt-10">
      <div className="self-stretch justify-between items-center inline-flex px-8">
        <div className="justify-start items-center gap-4 flex">
          <Image
            height={32}
            width={32}
            src="/logo_rounded_25percent.png"
            alt="logo"
          />
        </div>
        <div className="justify-center items-center gap-6 flex">
          <div className="justify-start items-center gap-3.5 flex">
            {links.map(({ href, name }) => (
              <Fragment key={href}>
                <FooterLink href={href}>{name}</FooterLink>
                <FooterItem>|</FooterItem>
              </Fragment>
            ))}

            <FooterItem>©2024 Auto.fun</FooterItem>

            <div className="w-8 h-8 p-2 rounded-lg border border-[#f1f1f1] justify-center items-center gap-2 flex hover:bg-white/10 transition-colors duration-200 cursor-pointer">
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
  );
};

export const FooterSkeleton = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A] border-t border-[#262626] py-6 px-4">
      <div className="max-w-[1680px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-24 h-4 bg-neutral-800 rounded animate-pulse" />
          <div className="w-px h-4 bg-neutral-800" />
          <div className="w-24 h-4 bg-neutral-800 rounded animate-pulse" />
          <div className="w-px h-4 bg-neutral-800" />
          <div className="w-24 h-4 bg-neutral-800 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-4">
          <div className="w-32 h-4 bg-neutral-800 rounded animate-pulse" />
          <div className="w-8 h-8 bg-neutral-800 rounded-full animate-pulse" />
        </div>
      </div>
    </footer>
  );
};
