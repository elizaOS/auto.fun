import FormImageInput from "@/components/common/input/FormImageInput";
import { FormInput } from "@/components/common/input/FormInput";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import { UseFormReturn, useWatch } from "react-hook-form";
import { TokenMetadataForm } from "../../../types/form.type";
import { Icons } from "./Icons";
import { CopyButton } from "./CopyButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/common/button/WalletButton";

const MAX_FILE_SIZE_MB = 5;
const MAX_INITIAL_SOL = 45;

export const TokenCreationForm = ({
  form: { register, control, formState, setValue },
  submit,
}: {
  form: UseFormReturn<TokenMetadataForm>;
  submit: () => void;
}) => {
  const { publicKey } = useWallet();

  const symbol = useWatch({ control, name: "symbol" });
  const description = useWatch({ control, name: "description" });
  const name = useWatch({ control, name: "name" });

  const agentLink = useWatch({ control, name: "links.agentLink" });
  const website = useWatch({ control, name: "links.website" });
  const twitter = useWatch({ control, name: "links.twitter" });
  const telegram = useWatch({ control, name: "links.telegram" });
  const discord = useWatch({ control, name: "links.discord" });

  return (
    <form className="flex flex-col w-full m-auto gap-7 justify-center">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FormInput
          type="text"
          {...register("name", { required: true })}
          label="Name"
          maxLength={50}
          rightIndicator={`${name?.length ?? 0}/50`}
          error={formState.errors.name?.message}
        />

        <FormInput
          type="text"
          {...register("symbol", { required: true })}
          label="Ticker"
          leftIndicator="$"
          maxLength={8}
          rightIndicator={`${symbol?.length ?? 0}/8`}
        />
      </div>

      <FormTextArea
        {...register("description", { required: true })}
        label="Token Description"
        rightIndicator={`${description?.length ?? 0}/2000`}
        minRows={5}
        maxLength={2000}
      />

      <FormImageInput
        label="Token Image"
        name="media_base64"
        // @ts-expect-error ignoring ts types for speed, will fix later
        control={control}
        rules={{
          required: "Please upload an image",
          validate: {
            lessThan4MB: (file) =>
              (file && file.size < MAX_FILE_SIZE_MB * 1024 * 1024) ||
              `The uploaded image exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please upload a smaller file.`,
            acceptedFormats: (file) =>
              (file &&
                ["image/jpeg", "image/png", "image/gif", "video/mp4"].includes(
                  file.type,
                )) ||
              "Only JPEG, PNG, GIF, and MP4 files are accepted",
          },
        }}
        maxSizeMb={MAX_FILE_SIZE_MB}
      />

      <FormInput
        type="text"
        {...register("links.agentLink")}
        label="Link Agent"
        isOptional
        inputTag={
          <div className="text-[#8c8c8c] text-base font-normal uppercase leading-normal tracking-widest">
            HTTPS://
          </div>
        }
        rightIndicator={<CopyButton text={agentLink} />}
      />

      <div className="flex flex-col gap-3">
        <FormInput.Label label="add project socials" isOptional />
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
          <FormInput
            type="text"
            {...register("links.website")}
            isOptional
            inputTag={Icons.Website}
            placeholder="Insert a link here"
            rightIndicator={<CopyButton text={website} />}
          />
          <FormInput
            type="text"
            {...register("links.twitter")}
            isOptional
            inputTag={Icons.Twitter}
            placeholder="Insert a link here"
            rightIndicator={<CopyButton text={twitter} />}
          />
          <FormInput
            type="text"
            {...register("links.telegram")}
            isOptional
            inputTag={Icons.Telegram}
            placeholder="Insert a link here"
            rightIndicator={<CopyButton text={telegram} />}
          />
          <FormInput
            type="text"
            {...register("links.discord")}
            isOptional
            inputTag={Icons.Discord}
            placeholder="Insert a link here"
            rightIndicator={<CopyButton text={discord} />}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <FormInput.Label label="buy your coin" isOptional />
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="grid grid-cols-3 gap-3 h-[46px]">
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() => setValue("initial_sol", "10")}
            >
              10 SOL
            </button>
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() => setValue("initial_sol", "25")}
            >
              25 SOL
            </button>
            <button
              type="button"
              className="bg-[#2e2e2e] py-2 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight"
              onClick={() =>
                setValue("initial_sol", MAX_INITIAL_SOL.toString())
              }
            >
              Max
            </button>
          </div>
          <FormInput
            type="number"
            step="any"
            {...register("initial_sol", {
              required: false,
              validate: (value) =>
                value === "" ||
                (parseFloat(value) >= 0 &&
                  parseFloat(value) <= MAX_INITIAL_SOL) ||
                `Max initial SOL is ${MAX_INITIAL_SOL}`,
            })}
            placeholder={`Custom max ${MAX_INITIAL_SOL} SOL`}
            onKeyDown={(e) => {
              if (
                !/[0-9.]/.test(e.key) &&
                e.key !== "Backspace" &&
                e.key !== "Delete" &&
                e.key !== "ArrowLeft" &&
                e.key !== "ArrowRight" &&
                e.key !== "Tab"
              ) {
                e.preventDefault();
              }
            }}
            min={0}
            error={formState.errors.initial_sol?.message}
          />
        </div>
      </div>

      <div className="h-0.5 bg-[#262626]" />

      <div className="flex flex-col items-center">
        <div className="text-white text-base font-normal font-['DM Mono'] uppercase leading-normal tracking-widest mb-2.5">
          Continue
        </div>
        {publicKey ? (
          <button
            type="button"
            className="bg-[#2e2e2e] py-2.5 px-4 rounded-md border border-neutral-800 text-[#2fd345] text-sm leading-tight disabled:opacity-30"
            onClick={submit}
            disabled={!formState.isValid}
          >
            Launch Token
          </button>
        ) : (
          <div className="absolute">
            <WalletButton />
          </div>
        )}
      </div>
    </form>
  );
};
