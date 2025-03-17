import { Link } from "react-router";

export default function Header() {
  return (
    <div className="border-b py-6">
      <div className="container flex gap-8 items-center">
        {/* Logo */}
        <img className="size-10" src="/logo.png" />
        <NavLink title="Tokens" href="/tokens" />
        <NavLink title="How It's Done" href="/tokens" />
        <NavLink title="Support" href="/tokens" />
      </div>
    </div>
  );
}

const NavLink = ({ title, href }: { title: string; href: string }) => {
  return (
    <Link to={href}>
      <div className="text-center justify-center text-autofun-text-primary text-base font-medium font-satoshi leading-tight">
        {title}
      </div>
    </Link>
  );
};
