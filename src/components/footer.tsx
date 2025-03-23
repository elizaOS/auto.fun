import { Link } from "react-router";
import SkeletonImage from "./skeleton-image";

export const Footer = () => {
  return (
    <div className="hidden xl:flex justify-between w-full container pb-4">
      <div className="justify-start items-center gap-4 flex">
        <SkeletonImage
          height={32}
          width={32}
          className="size-8"
          src="/logo.png"
          alt="logo"
        />
      </div>
      <div className="flex items-center gap-2.5">
        <FooterLink href="/privacy-policy" title="Privacy Policy" />
        <div className="w-[1px] h-4 bg-autofun-stroke-light" />
        <FooterLink href="/terms-of-service" title="Terms of Service" />
        <div className="w-[1px] h-4 bg-autofun-stroke-light" />
        <FooterLink href="/fees" title="Fees" />
        <Link to={"https://x.com/autodotfun"} target="_blank">
          <div className="size-10 p-0 grid place-items-center border rounded-md select-none">
            <div className="m-auto">
              <SkeletonImage
                src="/x-gray.svg"
                height={22}
                width={24}
                alt="twitter_icon"
                className="object-contain"
              />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

const FooterLink = ({ title, href }: { title: string; href: string }) => {
  return (
    <Link
      to={href}
      className="text-autofun-text-secondary font-medium hover:text-white transition-colors duration-200 select-none font-dm-mono text-base"
    >
      {title}
    </Link>
  );
};

export default Footer;
