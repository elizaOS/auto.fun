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
  return (
    <div className="flex gap-4 items-center text-white">
      <button
        className="group disabled:opacity-30"
        onClick={previousPage}
        disabled={!hasPreviousPage}
      >
        <span className="group-enabled:hover:font-extrabold">[ &lt;&lt;</span>
      </button>
      <span>{currentPage}</span>

      <button
        className="group disabled:opacity-30"
        onClick={nextPage}
        disabled={!hasNextPage}
      >
        <span className="group-enabled:hover:font-extrabold">&gt;&gt; ]</span>
      </button>
    </div>
  );
};
