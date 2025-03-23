import { Link } from "react-router";
import SkeletonImage from "./skeleton-image";

export const Footer = () => {
  return (
    <div className="hidden xl:flex justify-between w-full container">
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
        <Link
          to="/privacy-policy"
          className="text-autofun-text-secondary font-medium hover:text-white transition-colors duration-200 font-dm-mono text-base"
        >
          Privacy Policy
        </Link>
        <div className="w-[1px] h-4 bg-[#707070]" />
        <Link
          to="/terms-of-service"
          className="text-autofun-text-secondary font-medium hover:text-white transition-colors duration-200 font-dm-mono text-base"
        >
          Terms of Service
        </Link>
        <div className="w-[1px] h-4 bg-[#707070]" />
        <Link
          to="/fees"
          className="text-autofun-text-secondary font-medium hover:text-white transition-colors duration-200 font-dm-mono text-base"
        >
          Fees
        </Link>
        <div className="w-[1px] h-4 bg-[#707070]" />
        <p className="font-dm-mono font-medium text-autofun-text-secondary text-base">
          © {new Date().getFullYear()} Auto.fun
        </p>
        <Link to={"https://x.com/autodotfun"} target="_blank">
          <div className="size-10 p-0 grid place-items-center border rounded-md">
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

export default Footer;
