import { FormTextArea } from "@/components/common/input/FormTextArea";
import {
  AdvancedCreationProps,
  OutputAreaProps,
} from "../../../../types/components/forms/AgentDetails/AdvancedCreation.type";
import { toast } from "react-toastify";
import { useState } from "react";
import { BlurSpinnerOverlay } from "@/components/common/BlurSpinnerOverlay";
import { RefreshButton } from "./RefreshButton";

const OutputArea = ({ label, onRefresh, ...props }: OutputAreaProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="flex flex-col gap-3 h-full relative">
      <FormTextArea
        label={label}
        minRows={8}
        {...props}
        rightHeaderIndicator={
          <button
            type="button"
            className="disabled:opacity-30"
            disabled={isRefreshing}
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
            <RefreshButton />
          </button>
        }
      >
        {isRefreshing && <BlurSpinnerOverlay className="rounded-xl" />}
      </FormTextArea>
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
