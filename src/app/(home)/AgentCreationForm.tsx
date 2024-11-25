import { UseFormReturn } from "react-hook-form";
import { AgentDetailsForm } from "../../../types/form.type";

export const AgentCreationForm = ({
  form: { register },
}: {
  form: UseFormReturn<AgentDetailsForm>;
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
