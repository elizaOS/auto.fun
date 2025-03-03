// TODO: scroll to top of page when advancing pages
export const Paginator = ({
  currentPage,
  hasNextPage,
  previousPage,
  nextPage,
  totalPages = 1,
}: {
  currentPage: number;
  hasNextPage: boolean;
  previousPage: () => void;
  nextPage: () => void;
  totalPages?: number;
}) => {
  const handleNextPage = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    nextPage();
  };

  const getPageNumbers = () => {
    const numbers = [];
    
    // Always show first 10 numbers (except 6)
    for (let i = 1; i <= 10; i++) {
      if (i !== 6) { // Skip 6 as shown in the image
        numbers.push(i);
      }
    }

    // Add ellipsis and 200+ for large number of pages
    if (totalPages > 10) {
      numbers.push('...');
      numbers.push('200+');
    }

    return numbers;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex justify-end items-center w-full max-w-[1682px] h-[34px] gap-1">
      <div className="flex items-center gap-4">
        {pageNumbers.map((page, index) => (
          <button
            key={index}
            onClick={() => {
              if (typeof page === 'number' && page !== currentPage) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (page < currentPage) {
                  for (let i = 0; i < currentPage - page; i++) {
                    previousPage();
                  }
                } else {
                  for (let i = 0; i < page - currentPage; i++) {
                    nextPage();
                  }
                }
              }
            }}
            disabled={typeof page !== 'number' || page === currentPage}
            className={`flex justify-center items-center w-[34px] h-[34px] rounded-md font-mono text-base tracking-[2px] uppercase
              ${currentPage === page 
                ? 'bg-[#171717] border border-[#2FD345] text-white' 
                : 'text-[#8C8C8C] hover:text-white transition-colors'
              }
              ${typeof page !== 'number' ? 'cursor-default font-normal' : page === currentPage ? 'cursor-default' : 'cursor-pointer'}`}
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
    </div>
  );
};
