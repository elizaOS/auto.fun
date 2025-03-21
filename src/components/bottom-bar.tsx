import { Link } from "react-router";

export default function BottomBar() {
  const mobileNavItems = [
    { icon: "/nav/stars.svg", title: "Create Token", href: "/create" },
    { icon: "/nav/eye.svg", title: "View Tokens", href: "/tokens" },
    { icon: "/nav/circles.svg", title: "How To", href: "/how-it-works" },
    { icon: "/nav/question-mark.svg", title: "Support", href: "/support" },
  ];
  return (
    <nav className="border-t border-t-[#262626] fixed bottom-0 z-30 flex flex-col md:hidden items-center w-full  bg-[#171717] ">
      <div className="grid grid-cols-4  divide-x divide-[#262626] w-full ">
        {mobileNavItems.map((item, index) => (
          <Link
            key={index}
            to={item.href}
            className="flex hover:bg-[#2E2E2E] flex-col items-center justify-end py-2"
          >
            <img
              src={item.icon}
              width={20}
              height={20}
              alt="mobile-bottom-navbar-icon"
              className="size-5"
            />
            <h1 className="text-[12px] font-semibold mt-1">{item.title}</h1>
          </Link>
        ))}
      </div>
    </nav>
  );
}
