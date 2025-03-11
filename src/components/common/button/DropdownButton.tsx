import { PropsWithChildren } from "react";

const OpenButton = () => {
  return (
    <svg
      width="24"
      height="25"
      viewBox="0 0 24 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.9201 15.8573L13.4001 9.33727C12.6301 8.56727 11.3701 8.56727 10.6001 9.33727L4.08008 15.8573"
        stroke="#2FD345"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const CloseButton = () => {
  return (
    <svg
      width="24"
      height="25"
      viewBox="0 0 24 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.9201 9.75781L13.4001 16.2778C12.6301 17.0478 11.3701 17.0478 10.6001 16.2778L4.08008 9.75781"
        stroke="#2FD345"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const DropdownButton = ({
  disabled,
  onClick,
  open,
  children,
}: PropsWithChildren<{
  disabled?: boolean;
  onClick?: () => void;
  open: boolean;
}>) => {
  return (
    <button
      className="flex items-center gap-3 disabled:opacity-30"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <p>{children}</p>
      {open ? <OpenButton /> : <CloseButton />}
    </button>
  );
};
