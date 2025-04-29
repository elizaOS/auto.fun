import { Link, useLocation } from "react-router";

const Footer = () => {
  const { pathname } = useLocation();
  const isHomepage = pathname === "/";

  return (
    <div className="flex flex-col gap-2 bg-gradient-to-t from-black to-transparent p-4">
      {!isHomepage && (
        <img
          className="w-auto h-16 mt-16 mb-16 select-none"
          src="/dice.svg"
          alt="logo"
        />
      )}
      <div className="flex flex-wrap gap-2 items-center py-1 justify-between px-2">
        <div className="flex items-center gap-2.5 mx-auto py-2.5">
          <FooterLink href="/privacy-policy" title="Privacy" />
          <div className="w-[1px] h-4 bg-autofun-stroke-light" />
          <FooterLink href="/terms-of-service" title="Terms" />
          <div className="w-[1px] h-4 bg-autofun-stroke-light" />
          <FooterLink href="/fees" title="Fees" />
          <div className="w-[1px] h-4 bg-autofun-stroke-light" />
          <FooterLink title="Support" href="/support" />
          <Link to={"https://x.com/autodotfun"} target="_blank">
            <div className="size-7 p-0 grid place-items-center select-none">
              <div className="m-auto">
                <img
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
    </div>
  );
};

const FooterLink = ({ title, href }: { title: string; href: string }) => {
  return (
    <Link
      to={href}
      className="text-autofun-text-secondary font-medium hover:text-white transition-colors duration-200 select-none font-dm-mono text-sm"
    >
      {title}
    </Link>
  );
};

export default Footer;
