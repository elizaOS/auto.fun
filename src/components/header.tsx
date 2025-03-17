import { Link, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";

export default function Header() {
  return (
    <div className="border-b py-6">
      <div className="container flex gap-8 items-center">
        <Link to="/">
          <img className="size-10" src="/logo.png" />
        </Link>
        <NavLink title="Tokens" href="/" />
        <NavLink title="How It's Done" href="/" />
        <NavLink title="Support" href="/support" />
      </div>
    </div>
  );
}

const NavLink = ({ title, href }: { title: string; href: string }) => {
  const location = useLocation();

  return (
    <Link to={href}>
      <div
        className={twMerge([
          "text-center justify-center text-base font-medium font-satoshi leading-tight",
          location.pathname === href
            ? "text-autofun-text-primary"
            : "text-autofun-text-secondary",
        ])}
      >
        {title}
      </div>
    </Link>
  );
};
