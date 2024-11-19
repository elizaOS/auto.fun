import { FormInputProps } from "../../../../types/components/common/input/FormInput.type";

export const FormInput = ({ label, ...props }: FormInputProps) => {
  return (
    <>
      <label>
        {label}
        <input {...props} />
      </label>
    </>
  );
};
