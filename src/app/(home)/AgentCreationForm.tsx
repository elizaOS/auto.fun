import { UseFormReturn } from "react-hook-form";
import { AgentDetails } from "./form.types";

export const AgentCreationForm = ({
  form: { register },
}: {
  form: UseFormReturn<AgentDetails>;
}) => {
  return (
    <form>
      <input {...register("name", { required: true })} />
      <input {...register("description")} />
      <input {...register("personality")} />
      <input {...register("bio")} />
      <input {...register("lore")} />
      <input {...register("postExamples")} />
      <input {...register("style")} />
      <input {...register("adjectives")} />
    </form>
  );
};
