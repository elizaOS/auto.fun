// TODO: scroll to top of page when advancing pages
export const Paginator = ({
  currentPage,
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
  const handlePreviousPage = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    previousPage();
  };

  const handleNextPage = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    nextPage();
  };
  console.log(currentPage, hasPreviousPage, hasNextPage);

  return (
    <div className="flex gap-4 items-center text-white">
      <button
        type="button"
        className="group disabled:opacity-30"
        onClick={handlePreviousPage}
        disabled={!hasPreviousPage}
      >
        <span className="group-hover:font-extrabold group-disabled:hover:font-normal">[ &lt;&lt;</span>
      </button>
      <span>{currentPage}</span>

      <button
        type="button"
        className="group disabled:opacity-30"
        onClick={handleNextPage}
        disabled={!hasNextPage}
      >
        <span className="group-hover:font-extrabold group-disabled:hover:font-normal">&gt;&gt; ]</span>
      </button>
    </div>
  );
};
