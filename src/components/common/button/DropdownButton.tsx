import { PropsWithChildren } from "react";

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
      {open ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M12.4999 9.16797L9.99988 11.668L7.49988 9.16797"
            stroke="#03FF24"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.99988 2.50195C15.9999 2.50195 17.4999 4.00195 17.4999 10.002C17.4999 16.002 15.9999 17.502 9.99988 17.502C3.99988 17.502 2.49988 16.002 2.49988 10.002C2.49988 4.00195 3.99988 2.50195 9.99988 2.50195Z"
            stroke="#03FF24"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M9.16797 7.5L11.668 10L9.16797 12.5"
            stroke="#03FF24"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2.50195 10C2.50195 4 4.00195 2.5 10.002 2.5C16.002 2.5 17.502 4 17.502 10C17.502 16 16.002 17.5 10.002 17.5C4.00195 17.5 2.50195 16 2.50195 10Z"
            stroke="#03FF24"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
};
