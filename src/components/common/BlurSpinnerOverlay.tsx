export const BlurSpinnerOverlay = ({ className }: { className?: string }) => {
  return (
    <div
      className={`absolute inset-0 backdrop-blur-sm z-10 flex justify-center items-center ${className}`}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin"
      >
        <path
          d="M19.9998 5.00195C17.033 5.00195 14.1329 5.88169 11.6662 7.52991C9.19947 9.17813 7.27688 11.5208 6.14157 14.2617C5.00626 17.0026 4.70921 20.0186 5.28798 22.9283C5.86676 25.838 7.29537 28.5108 9.39316 30.6086C11.4909 32.7063 14.1637 34.135 17.0734 34.7137C19.9831 35.2925 22.9991 34.9955 25.74 33.8601C28.4809 32.7248 30.8236 30.8022 32.4718 28.3355C34.12 25.8688 34.9998 22.9687 34.9998 20.002"
          stroke="#03FF24"
          strokeWidth="3.33333"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
