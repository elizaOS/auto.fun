import { FormTab } from "../types";

interface VanityAddressSectionProps {
  activeTab: FormTab;
  isGeneratingVanity: boolean;
  displayedPublicKey: string;
  vanitySuffix: string;
  vanityResult: { publicKey: string; secretKey: any } | null;
  suffixError: string | null;
  onSuffixChange: (suffix: string) => void;
  onGenerateClick: () => void;
}

export const VanityAddressSection = ({
  activeTab,
  isGeneratingVanity,
  displayedPublicKey,
  vanitySuffix,
  vanityResult,
  suffixError,
  onSuffixChange,
  onGenerateClick,
}: VanityAddressSectionProps) => {
  if (activeTab === FormTab.IMPORT) return null;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
        Generate Contract Address
      </label>
      <div className="font-mono text-xs md:text-lg lg:text-xl break-all min-h-[2.5em] flex items-center justify-center">
        <span className="mr-2">
          {isGeneratingVanity ? (
            <span className="animate-pulse">
              {displayedPublicKey.slice(0, -vanitySuffix.length)}
              <strong>{displayedPublicKey.slice(-vanitySuffix.length)}</strong>
            </span>
          ) : vanityResult ? (
            <span className="text-green-400">
              {displayedPublicKey.slice(0, -vanitySuffix.length)}
              <strong>{displayedPublicKey.slice(-vanitySuffix.length)}</strong>
            </span>
          ) : (
            <span className="text-neutral-500">
              {displayedPublicKey.slice(0, -vanitySuffix.length)}
              <strong>{displayedPublicKey.slice(-vanitySuffix.length)}</strong>
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 mx-auto">
        <input
          type="text"
          value={vanitySuffix}
          onChange={(e) => onSuffixChange(e.target.value)}
          placeholder="FUN"
          maxLength={5}
          className={`bg-autofun-background-input w-20 py-1.5 px-2 ${
            suffixError &&
            !suffixError.startsWith("Warning") &&
            !suffixError.startsWith("Note")
              ? "border-red-500"
              : ""
          } text-white text-center font-mono focus:outline-none focus:border-white disabled:opacity-50`}
        />
        <button type="button" onClick={onGenerateClick}>
          <img
            src={
              isGeneratingVanity
                ? "/create/generating.svg"
                : "/create/generateup.svg"
            }
            alt="Generate"
            className="w-24 ml-2"
            onMouseDown={(e) => {
              const img = e.target as HTMLImageElement;
              if (!isGeneratingVanity) {
                img.src = "/create/generatedown.svg";
              }
            }}
            onMouseUp={(e) => {
              const img = e.target as HTMLImageElement;
              if (!isGeneratingVanity) {
                img.src = "/create/generateup.svg";
              }
            }}
            onDragStart={(e) => {
              e.preventDefault();
              const img = e.target as HTMLImageElement;
              if (!isGeneratingVanity) {
                img.src = "/create/generateup.svg";
              }
            }}
            onMouseOut={(e) => {
              e.preventDefault();
              const img = e.target as HTMLImageElement;
              if (!isGeneratingVanity) {
                img.src = "/create/generateup.svg";
              }
            }}
          />
        </button>
      </div>
      <p className="mx-auto text-center text-xs text-neutral-500 mt-1">
        Choose a custom suffix
        <br />
        Longer suffixes are slower to generate
      </p>

      {suffixError && (
        <div
          className={`text-xs ${
            suffixError.startsWith("Warning") || suffixError.startsWith("Note")
              ? "text-yellow-400"
              : "text-red-500"
          } mt-1`}
        >
          {suffixError}
        </div>
      )}
    </div>
  );
};
