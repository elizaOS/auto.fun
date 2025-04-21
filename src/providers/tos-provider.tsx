import { PropsWithChildren } from "react";

export default function TosProvider({ children }: PropsWithChildren) {
  const localStorageSave = false;

  return localStorageSave ? (
    <>{children}</>
  ) : (
    <div className="h-screen w-screen grid place-items-center bg-autofun-background">
      <div className="max-w-[400px] md:max-w-[496px] w-full bg-autofun-background-card shadow-lg overflow-hidden">
        <div className="p-4 border-b border-autofun-border relative">
          <h1 className="text-xl font-satoshi font-medium tracking-[-0.018em] text-autofun-text-highlight">
            How Auto.Fun Works
          </h1>
        </div>

        <div className="p-6 text-center">
          <p className="text-autofun-text-info font-satoshi text-base mb-4">
            Auto.Fun empowers anyone to create coins. All coins created on Auto.Fun are
            fair-launch, ensuring that everyone has an equal opportunity to buy
            and sell when the coin is first introduced.
          </p>
          <p className="text-autofun-background-action-highlight text-left font-satoshi mb-6 text-xl">
            Here’s how it works:
          </p>
          <ol className="text-white font-satoshi text-left space-y-4 text-base mb-6 list-decimal list-inside">
            <li>Choose a coin that catches your interest</li>
            <li>Purchase the coin through the bonding curve</li>
            <li>Sell it whenever you wish to lock in your gains or losses</li>
          </ol>
          <p className="text-autofun-text-secondary font-satoshi text-base mb-6">
            By clicking the button below, you agree to the Terms of Service.
          </p>

          <button className="m-4 bg-autofun-background-action-highlight text-black px-6 py-2 hover:bg-gray-200 transition-all font-semibold">
            I'm ready to have fun
          </button>
        </div>

        <div className="mt-3 border-t border-autofun-border p-4 flex justify-center gap-4 text-xs text-autofun-background-disabled">
          <button className="hover:underline">Privacy Policy</button>
          <button className="hover:underline">Terms of Service</button>
          <button className="hover:underline">Fees</button>
        </div>
      </div>
    </div>
  );
}