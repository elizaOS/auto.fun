interface AutoTabContentProps {
  userPrompt: string;
  setUserPrompt: (prompt: string) => void;
  errors: { userPrompt?: string; [k: string]: string | undefined };
  isProcessingPrompt: boolean;
  generateFromPrompt: () => Promise<void>;
}

export const AutoTabContent = ({
  userPrompt,
  setUserPrompt,
  errors,
  isProcessingPrompt,
  generateFromPrompt,
}: AutoTabContentProps) => {
  return (
    <>
      <div className="flex">
        <input
          type="text"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
          className="flex-1 truncate my-2 p-0 border-b-2 pb-2.5 border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white"
        />
        <button
          type="button"
          onClick={generateFromPrompt}
          disabled={isProcessingPrompt || !userPrompt.trim()}
          className="p-0 transition-colors disabled:opacity-50"
        >
          <img
            src={
              isProcessingPrompt
                ? "/create/generating.svg"
                : "/create/generateup.svg"
            }
            alt="Generate"
            className="w-24 ml-2"
            onMouseDown={(e) => {
              const img = e.target as HTMLImageElement;
              if (!isProcessingPrompt) {
                img.src = "/create/generatedown.svg";
              }
            }}
            onMouseUp={(e) => {
              const img = e.target as HTMLImageElement;
              if (!isProcessingPrompt) {
                img.src = "/create/generateup.svg";
              }
            }}
            onDragStart={(e) => {
              e.preventDefault();
              const img = e.target as HTMLImageElement;
              if (!isProcessingPrompt) {
                img.src = "/create/generateup.svg";
              }
            }}
            onMouseOut={(e) => {
              e.preventDefault();
              const img = e.target as HTMLImageElement;
              if (!isProcessingPrompt) {
                img.src = "/create/generateup.svg";
              }
            }}
          />
        </button>
      </div>
      {errors.userPrompt && (
        <div className="text-red-500 text-sm">{errors.userPrompt}</div>
      )}
    </>
  );
};
