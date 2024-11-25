import FormImageInput from "@/components/common/input/FormImageInput";
import { FormInput } from "@/components/common/input/FormInput";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import { UseFormReturn } from "react-hook-form";
import { TokenMetadataForm } from "../../../types/form.type";

// TODO: put form tag in here, will split into 3 separate forms
// that way we can easily check form validity for each form step
export const TokenCreationForm = ({
  form: { watch, register, control },
}: {
  form: UseFormReturn<TokenMetadataForm>;
}) => {
  const symbol = watch("symbol");
  const description = watch("description");
  const name = watch("name");

  return (
    <form className="flex flex-col w-full m-auto gap-7 justify-center">
      <FormInput
        type="text"
        {...register("name", { required: true })}
        label="Name"
        maxLength={50}
        rightIndicator={`${name?.length ?? 0}/50`}
        rightIndicatorOpacity={name?.length >= 50 ? "full" : "low"}
        placeholder="Da Vinci"
      />

      <FormInput
        type="text"
        {...register("symbol", { required: true })}
        label="Ticker"
        leftIndicator="$"
        maxLength={8}
        rightIndicator={`${symbol?.length ?? 0}/8`}
        rightIndicatorOpacity={symbol?.length >= 8 ? "full" : "low"}
      />

      <FormTextArea
        {...register("description", { required: true })}
        label="Token Description"
        rightIndicator={`${description?.length ?? 0}/2000`}
        minRows={2}
        maxLength={2000}
        rightIndicatorOpacity={description?.length >= 2000 ? "full" : "low"}
        placeholder="The ghost of Da Vinci trapped in Web3"
      />

      <FormImageInput
        label="Token Image / Video"
        name="media_base64"
        // @ts-expect-error ignoring ts types for speed, will fix later
        control={control}
        rules={{
          required: "Please upload an image",
          validate: {
            lessThan4MB: (file) =>
              (file && file.size < 4000000) || "Max file size is 4MB",
            acceptedFormats: (file) =>
              (file &&
                ["image/jpeg", "image/png", "image/gif", "video/mp4"].includes(
                  file.type,
                )) ||
              "Only JPEG, PNG, GIF, and MP4 files are accepted",
          },
        }}
      />

      <FormInput
        type="number"
        step="any"
        {...register("initial_sol", {
          required: false,
          validate: (value) => value === "" || parseInt(value, 10) >= 0,
        })}
        label="Buy Your Coin (optional)"
        rightIndicator="SOL"
        onKeyDown={(e) => {
          if (e.key === "-") {
            e.preventDefault();
          }
        }}
        min={0}
      />
    </form>
  );
};
