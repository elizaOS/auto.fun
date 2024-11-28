import { useForm } from "react-hook-form";
import { AgentDetails } from "../forms/AgentDetails";
import { AgentDetailsForm } from "../../../types/form.type";
import { CenterFormContainer } from "../common/containers/CenterFormContainer";
import { RoundedButton } from "../common/button/RoundedButton";
import { AgentUpdateFormProps } from "../../../types/components/agents/AgentUpdateForm.type";
import { AgentMedia } from "./AgentMedia";

export const AgentUpdateForm = ({
  isActive,
  name,
  mediaSrc,
  onBack,
}: AgentUpdateFormProps) => {
  // TODO: use react query hook to fetch agent data from id and fill the form data with the retrieved data
  const agentForm = useForm<AgentDetailsForm>();
  const sideButtonStyles = "p-3 bg-transparent font-medium";

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

      <div className="flex flex-col gap-6 absolute top-24 left-[5%]">
        <div className="p-4 flex bg-[#002605] rounded-xl items-center justify-between">
          <div className="flex gap-3 items-center">
            <AgentMedia mediaSrc={mediaSrc} />
            <p>{name}</p>
          </div>

          {isActive ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <g clipPath="url(#clip0_544_1531)">
                <path
                  d="M10 19.1998C4.92725 19.1998 0.800049 15.0726 0.800049 9.9998C0.800049 4.927 4.92725 0.799805 10 0.799805C15.0728 0.799805 19.2 4.927 19.2 9.9998C19.2 15.0726 15.0728 19.1998 10 19.1998Z"
                  fill="#03FF24"
                />
              </g>
              <defs>
                <clipPath id="clip0_544_1531">
                  <rect width="20" height="20" fill="white" />
                </clipPath>
              </defs>
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M10 20C15.5139 20 20 15.5139 20 10C20 4.48609 15.5139 0 10 0C4.48609 0 0 4.48609 0 10C0 15.5139 4.48609 20 10 20Z"
                fill="#FF0000"
              />
            </svg>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <RoundedButton className={sideButtonStyles} variant="outlined">
            View Token on pump.fun
          </RoundedButton>
          <RoundedButton className={sideButtonStyles} variant="outlined">
            View Agent on X / Twitter
          </RoundedButton>
          {isActive ? (
            <RoundedButton
              className={sideButtonStyles}
              color="red"
              variant="outlined"
            >
              Deactivate Agent
            </RoundedButton>
          ) : (
            <RoundedButton className="p-3 font-medium">
              Activate Agent
            </RoundedButton>
          )}
        </div>
      </div>

      <CenterFormContainer
        formComponent={<AgentDetails form={agentForm} />}
        submitButton={
          <RoundedButton className="font-medium p-3">
            Update Agent
          </RoundedButton>
        }
      />
    </div>
  );
};
