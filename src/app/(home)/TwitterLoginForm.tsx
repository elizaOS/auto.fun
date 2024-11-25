import { FormInput } from "@/components/common/input/FormInput";
import { useState } from "react";
import { TwitterDetailsForm } from "../../../types/form.type";
import { UseFormReturn } from "react-hook-form";
import { LuEye, LuEyeOff } from "react-icons/lu";

export const TwitterLoginForm = ({
  form: { register },
}: {
  form: UseFormReturn<TwitterDetailsForm>;
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <div className="flex gap-3 w-full items-center justify-center">
        <div className="bg-[#002605] h-[2px] flex-1" />
        <p>X/Twitter Integration</p>
        <div className="bg-[#002605] h-[2px] flex-1" />
      </div>

      <p className="text-center text-xs">
        Use your Agent’s new X / Twitter Account
      </p>

      <FormInput
        {...register("twitter_email", { required: true })}
        type="text"
        label="Email"
      />
      <FormInput
        {...register("twitter_username", { required: true })}
        type="text"
        label="Username"
      />
      <FormInput
        {...register("twitter_password", { required: true })}
        type={showPassword ? "text" : "password"}
        label="Password"
        rightIndicatorOpacity="full"
        rightIndicator={
          <button
            type="button"
            onClick={() => {
              setShowPassword((show) => !show);
            }}
          >
            {showPassword ? (
              <LuEyeOff color="#03FF24" />
            ) : (
              <LuEye color="#03FF24" />
            )}
          </button>
        }
      />
    </>
  );
};
