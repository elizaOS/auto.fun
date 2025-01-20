import { AgentUpdateFormProps } from "../../../../types/components/agents/AgentUpdateForm.type";
import { PropsWithChildren } from "react";

export const UpdateFormContainer = ({
  children,
  onBack,
}: PropsWithChildren & Pick<AgentUpdateFormProps, "onBack">) => {
  return (
    <div className="flex flex-col justify-center h-full relative">
      <button className="absolute top-4 left-[5%]" onClick={onBack}>
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="0.5"
            y="0.5"
            width="43"
            height="43"
            rx="11.5"
            stroke="#03FF24"
          />
          <path
            d="M16.1665 21.9993H27.8332M16.1665 21.9993L19.4998 25.3327M16.1665 21.9993L19.4998 18.666"
            stroke="#03FF24"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="w-full flex justify-center">{children}</div>
    </div>
  );
};
