import { RoundedButton } from "../common/button/RoundedButton";
import { HowItWorks } from "./HowItWorks";

export const Nav = () => {
  // TODO: add twitter link once we have one
  return (
    <nav className="px-[5%] flex justify-between items-center">
      <div className="flex gap-6 items-center">
        <p>auto.fun</p>
        <a className="underline">X / Twitter</a>
      </div>
      <div className="flex gap-6 items-center">
        <HowItWorks />
        <RoundedButton>Connect Wallet</RoundedButton>
      </div>
    </nav>
  );
};
