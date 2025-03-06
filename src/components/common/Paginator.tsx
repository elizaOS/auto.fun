// TODO: scroll to top of page when advancing pages
export const Paginator = ({
  currentPage,
  hasNextPage,
  previousPage,
  nextPage,
  totalPages = 1,
  goToPage,
}: {
  currentPage: number;
  hasNextPage: boolean;
  previousPage: () => void;
  nextPage: () => void;
  totalPages?: number;
  goToPage: (page: number) => void;
}) => {
  const handleNextPage = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    nextPage();
  };

  const getPageNumbers = () => {
    const numbers = [];
    for (let i = 1; i <= totalPages; i++) {
      numbers.push(i);
    }
    return numbers;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex justify-end items-center w-full max-w-[1682px] h-[34px] gap-1">
      <div className="flex items-center gap-4">
        <button
          onClick={previousPage}
          disabled={currentPage === 1}
          className="flex items-center justify-center w-6 h-6 ml-2"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className={`${currentPage === 1 ? "opacity-30" : "hover:opacity-80"}`}
            style={{
              transform: "rotate(180deg)",
            }}
          >
            <path
              d="M8.91 19.92L15.43 13.4C16.2 12.63 16.2 11.37 15.43 10.6L8.91 4.08"
              stroke="white"
              strokeWidth="1.5"
              strokeMiterlimit="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {pageNumbers.map((page, index) => (
          <button
            key={index}
            onClick={() => {
              if (typeof page === "number" && page !== currentPage) {
                goToPage(page);
              }
            }}
            disabled={typeof page !== "number" || page === currentPage}
            className={`flex justify-center items-center w-[34px] h-[34px] rounded-md font-mono text-base tracking-[2px] uppercase
              ${
                currentPage === page
                  ? "bg-[#171717] border border-[#2FD345] text-white"
                  : "text-[#8C8C8C] hover:text-white transition-colors"
              }
              ${typeof page !== "number" ? "cursor-default font-normal" : page === currentPage ? "cursor-default" : "cursor-pointer"}`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={handleNextPage}
          disabled={!hasNextPage}
          className="flex items-center justify-center w-6 h-6 ml-2"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className={`${!hasNextPage ? "opacity-30" : "hover:opacity-80"}`}
          >
            <path
              d="M8.91 19.92L15.43 13.4C16.2 12.63 16.2 11.37 15.43 10.6L8.91 4.08"
              stroke="white"
              strokeWidth="1.5"
              strokeMiterlimit="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
