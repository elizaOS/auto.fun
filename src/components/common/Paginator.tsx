// TODO: scroll to top of page when advancing pages
export const Paginator = ({
  currentPage,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasPreviousPage,
  hasNextPage,
  previousPage,
  nextPage,
}: {
  currentPage: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  previousPage: () => void;
  nextPage: () => void;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePreviousPage = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    previousPage();
  };

  const handleNextPage = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    nextPage();
  };

  const pages = [1, 2, 3, 4, 5, 7, 8, 9, 10, '...', '200+'];

  return (
    <div className="flex justify-end items-center w-full max-w-[1682px] h-[34px] gap-1">
      {pages.map((page, index) => (
        <button
          key={index}
          className={`flex justify-center items-center w-[34px] h-[34px] rounded-md font-mono text-base tracking-[2px] uppercase
            ${currentPage === page 
              ? 'bg-[#171717] border border-[#2FD345] text-white' 
              : 'text-[#8C8C8C] hover:text-white transition-colors'
            }`}
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
          className={`${!hasNextPage ? 'opacity-30' : 'hover:opacity-80'}`}
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
  );
};
