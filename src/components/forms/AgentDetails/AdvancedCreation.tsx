import { FormTextArea } from "@/components/common/input/FormTextArea";
import {
  AdvancedCreationProps,
  OutputAreaProps,
} from "../../../../types/components/forms/AgentDetails/AdvancedCreation.type";
import { toast } from "react-toastify";
import { useState } from "react";
import { BlurSpinnerOverlay } from "@/components/common/loading/BlurSpinnerOverlay";

const OutputArea = ({ label, onRefresh, ...props }: OutputAreaProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="flex flex-col gap-3 h-full relative">
      {isRefreshing && <BlurSpinnerOverlay />}
      <FormTextArea label={label} minRows={8} {...props} />
      <button
        type="button"
        className="absolute bottom-3 right-3"
        onClick={async () => {
          try {
            setIsRefreshing(true);
            await onRefresh();
          } catch {
            toast.error("Oops! Something went wrong. Please try again.");
          } finally {
            setIsRefreshing(false);
          }
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M17.8127 3.7508V7.5008C17.8127 7.74944 17.714 7.9879 17.5382 8.16372C17.3623 8.33953 17.1239 8.4383 16.8752 8.4383H13.1252C12.8766 8.4383 12.6381 8.33953 12.4623 8.16372C12.2865 7.9879 12.1877 7.74944 12.1877 7.5008C12.1877 7.25216 12.2865 7.01371 12.4623 6.83789C12.6381 6.66208 12.8766 6.5633 13.1252 6.5633H14.6096L14.0002 5.95393C12.897 4.84519 11.3987 4.21971 9.83462 4.21487H9.80102C8.25089 4.21156 6.76175 4.81861 5.65571 5.90471C5.47793 6.07855 5.23838 6.17465 4.98975 6.17187C4.74112 6.16908 4.50377 6.06764 4.32993 5.88987C4.15609 5.71209 4.05999 5.47253 4.06277 5.2239C4.06556 4.97527 4.167 4.73793 4.34478 4.56408C5.80119 3.13397 7.7622 2.33492 9.80337 2.33987H9.84399C11.9032 2.34548 13.8758 3.16855 15.3284 4.62815L15.9377 5.23518V3.7508C15.9377 3.50216 16.0365 3.26371 16.2123 3.08789C16.3881 2.91208 16.6266 2.8133 16.8752 2.8133C17.1239 2.8133 17.3623 2.91208 17.5382 3.08789C17.714 3.26371 17.8127 3.50216 17.8127 3.7508ZM14.3448 14.0969C13.2382 15.1836 11.7481 15.7907 10.1971 15.7867H10.1635C8.59941 15.7819 7.10116 15.1564 5.9979 14.0477L5.39087 13.4383H6.87524C7.12388 13.4383 7.36234 13.3395 7.53816 13.1637C7.71397 12.9879 7.81274 12.7494 7.81274 12.5008C7.81274 12.2522 7.71397 12.0137 7.53816 11.8379C7.36234 11.6621 7.12388 11.5633 6.87524 11.5633H3.12524C2.8766 11.5633 2.63815 11.6621 2.46233 11.8379C2.28652 12.0137 2.18774 12.2522 2.18774 12.5008V16.2508C2.18774 16.4994 2.28652 16.7379 2.46233 16.9137C2.63815 17.0895 2.8766 17.1883 3.12524 17.1883C3.37388 17.1883 3.61234 17.0895 3.78816 16.9137C3.96397 16.7379 4.06274 16.4994 4.06274 16.2508V14.7664L4.67212 15.3758C6.12503 16.8345 8.09765 17.6567 10.1565 17.6617H10.2002C12.2414 17.6667 14.2024 16.8676 15.6588 15.4375C15.7469 15.3514 15.8171 15.2489 15.8655 15.1357C15.9138 15.0224 15.9395 14.9008 15.9408 14.7777C15.9422 14.6546 15.9193 14.5324 15.8735 14.4182C15.8277 14.3039 15.7598 14.1998 15.6737 14.1117C15.5876 14.0237 15.485 13.9535 15.3718 13.9051C15.2586 13.8567 15.137 13.8311 15.0139 13.8297C14.8908 13.8284 14.7686 13.8512 14.6543 13.8971C14.54 13.9429 14.4359 14.0108 14.3479 14.0969H14.3448Z"
            fill="#03FF24"
          />
        </svg>
      </button>
    </div>
  );
};

export const AdvancedCreation = ({
  register,
  refreshField,
}: AdvancedCreationProps) => {
  return (
    <div className="flex flex-col gap-6">
      <OutputArea
        {...register("systemPrompt")}
        label="System Prompt"
        onRefresh={() => refreshField("systemPrompt")}
      />
      <OutputArea
        {...register("bio")}
        label="Bio"
        onRefresh={() => refreshField("bio")}
      />
      <OutputArea
        {...register("lore")}
        label="Lore"
        onRefresh={() => refreshField("lore")}
      />
      <OutputArea
        {...register("postExamples")}
        label="Post Examples"
        onRefresh={() => refreshField("postExamples")}
      />
      <OutputArea
        {...register("topics")}
        label="Topics"
        onRefresh={() => refreshField("topics")}
      />
      <OutputArea
        {...register("style")}
        label="Style"
        onRefresh={() => refreshField("style")}
      />
      <OutputArea
        {...register("adjectives")}
        label="Adjectives"
        onRefresh={() => refreshField("adjectives")}
      />
    </div>
  );
};
