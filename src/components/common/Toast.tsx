import { useEffect } from "react";

type CustomToastProps = {
  message: string;
  closeToast?: () => void;
} & (
  | {
      status: "completed";
    }
  | {
      status: "failed";
      tryAgain?: () => void;
    }
);

export const Toast = ({ message, closeToast, ...props }: CustomToastProps) => {
  useEffect(() => {
    if (props.status === "completed") {
      const timer = setTimeout(() => {
        closeToast?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [closeToast, props.status]);

  return (
    <div
    className={`
      w-[320px]
      rounded-lg
      shadow-lg
      ${
        props.status === "failed"
          ? "bg-[#49132f]/95 border border-[#ef4242]"
          : "bg-[#282d3a]/95 border border-[#14ed8c]"
      }
    `}
    >
      <div className="flex flex-col gap-2 p-4 relative">
        {closeToast && (
           <button
           onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
             event.stopPropagation();
             if (closeToast) {
               closeToast();
             }
           }}
           className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors cursor-pointer"
           aria-label="Close toast"
         >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17 3.33989C18.5083 4.21075 19.7629 5.46042 20.6398 6.96519C21.5167 8.46997 21.9854 10.1777 21.9994 11.9192C22.0135 13.6608 21.5725 15.3758 20.72 16.8946C19.8676 18.4133 18.6332 19.6831 17.1392 20.5782C15.6452 21.4733 13.9434 21.9627 12.2021 21.998C10.4608 22.0332 8.74055 21.6131 7.21155 20.7791C5.68256 19.9452 4.39787 18.7264 3.48467 17.2434C2.57146 15.7604 2.06141 14.0646 2.005 12.3239L2 11.9999L2.005 11.6759C2.061 9.94888 2.56355 8.26585 3.46364 6.79089C4.36373 5.31592 5.63065 4.09934 7.14089 3.25977C8.65113 2.42021 10.3531 1.98629 12.081 2.00033C13.8089 2.01437 15.5036 2.47589 17 3.33989ZM10.511 9.13989C10.3015 9.01517 10.0536 8.9713 9.81401 9.01652C9.57441 9.06175 9.35959 9.19296 9.20995 9.38547C9.06031 9.57799 8.98617 9.81854 9.00146 10.0619C9.01675 10.3052 9.12043 10.5346 9.293 10.7069L10.585 11.9999L9.293 13.2929L9.21 13.3869C9.05459 13.5879 8.98151 13.8405 9.0056 14.0934C9.02969 14.3463 9.14916 14.5806 9.33972 14.7486C9.53029 14.9167 9.77767 15.0059 10.0316 14.9981C10.2856 14.9904 10.527 14.8862 10.707 14.7069L12 13.4149L13.293 14.7069L13.387 14.7899C13.588 14.9453 13.8406 15.0184 14.0935 14.9943C14.3464 14.9702 14.5807 14.8507 14.7488 14.6602C14.9168 14.4696 15.006 14.2222 14.9982 13.9683C14.9905 13.7143 14.8863 13.4728 14.707 13.2929L13.415 11.9999L14.707 10.7069L14.79 10.6129C14.9454 10.4119 15.0185 10.1593 14.9944 9.90637C14.9703 9.65344 14.8508 9.41917 14.6603 9.25114C14.4697 9.08311 14.2223 8.99391 13.9684 9.00166C13.7144 9.00942 13.473 9.11354 13.293 9.29289L12 10.5849L10.707 9.29289L10.613 9.20989L10.511 9.13989Z"
                fill="white"
                fillOpacity="0.3"
              />
            </svg>
          </button>
        )}

        <div className="text-white text-sm font-medium pr-6">
          {message}
        </div>

        <div className="flex items-center gap-2">
          {props.status === "completed" ? (
            <div className="flex items-center gap-2 text-[#14ed8c] text-sm">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Completed</span>
            </div>
          ) : (
            <div className="w-full">
              <div className="flex items-center gap-2 text-[#ef4242] text-sm mb-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Failed</span>
              </div>

              {props.tryAgain && (
                <button
                  onClick={() => {
                    closeToast?.();
                    props.tryAgain?.();
                  }}
                  className="w-full py-2 px-4 bg-[#ef4242]/20 hover:bg-[#ef4242]/30 text-[#ef4242] text-sm font-medium rounded transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};