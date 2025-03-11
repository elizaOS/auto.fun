import { FormInput } from "@/components/common/input/FormInput";
import { useState } from "react";
import { TwitterDetailsForm } from "../../../types/form.type";
import { UseFormReturn } from "react-hook-form";

export const TwitterLoginForm = ({
  form: { register },
}: {
  form: UseFormReturn<TwitterDetailsForm>;
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <FormInput.Label label="connect agent" />
      <FormInput
        {...register("twitter_username", { required: true })}
        type="text"
        inputTag={
          <div className="text-[#8c8c8c] uppercase leading-normal tracking-widest">
            Username
          </div>
        }
        placeholder="Insert the agent's X username"
      />
      <FormInput
        {...register("twitter_email", { required: true })}
        type="text"
        inputTag={
          <div className="text-[#8c8c8c] uppercase leading-normal tracking-widest">
            email&nbsp;&nbsp;&nbsp;
          </div>
        }
        placeholder="Insert X email"
      />
      <FormInput
        {...register("twitter_password", { required: true })}
        type={showPassword ? "text" : "password"}
        inputTag={
          <div className="text-[#8c8c8c] uppercase leading-normal tracking-widest">
            Password
          </div>
        }
        rightIndicator={
          <button
            type="button"
            onClick={() => {
              setShowPassword((show) => !show);
            }}
          >
            {!showPassword ? (
              <svg
                width="24"
                height="25"
                viewBox="0 0 24 25"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15.5799 12.8075C15.5799 14.7875 13.9799 16.3875 11.9999 16.3875C10.0199 16.3875 8.41992 14.7875 8.41992 12.8075C8.41992 10.8275 10.0199 9.22754 11.9999 9.22754C13.9799 9.22754 15.5799 10.8275 15.5799 12.8075Z"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.9998 21.0773C15.5298 21.0773 18.8198 18.9973 21.1098 15.3973C22.0098 13.9873 22.0098 11.6173 21.1098 10.2073C18.8198 6.60734 15.5298 4.52734 11.9998 4.52734C8.46984 4.52734 5.17984 6.60734 2.88984 10.2073C1.98984 11.6173 1.98984 13.9873 2.88984 15.3973C5.17984 18.9973 8.46984 21.0773 11.9998 21.0773Z"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg
                width="20"
                height="21"
                viewBox="0 0 20 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12.1083 8.69922L7.8916 12.9159C7.34994 12.3742 7.0166 11.6326 7.0166 10.8076C7.0166 9.15755 8.34993 7.82422 9.99993 7.82422C10.8249 7.82422 11.5666 8.15755 12.1083 8.69922Z"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14.8499 5.61602C13.3915 4.51602 11.7249 3.91602 9.99987 3.91602C7.0582 3.91602 4.31654 5.64935 2.4082 8.64935C1.6582 9.82435 1.6582 11.7993 2.4082 12.9743C3.06654 14.0077 3.8332 14.8993 4.66654 15.616"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.0166 17.0827C7.9666 17.4827 8.97493 17.6993 9.99993 17.6993C12.9416 17.6993 15.6833 15.966 17.5916 12.966C18.3416 11.791 18.3416 9.81602 17.5916 8.64102C17.3166 8.20768 17.0166 7.79935 16.7083 7.41602"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12.9252 11.3906C12.7085 12.5656 11.7502 13.524 10.5752 13.7406"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.8915 12.916L1.6665 19.141"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M18.3334 2.47461L12.1084 8.69961"
                  stroke="#8C8C8C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        }
        placeholder="Insert X password"
      />
    </div>
  );
};
