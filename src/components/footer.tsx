export const Footer = () => {
  return (
    <div className="flex-col justify-center items-center flex py-5 w-full">
      <div className="self-stretch justify-between items-center inline-flex">
        <div className="justify-start items-center gap-4 flex">
          <img height={32} width={32} src="/logo.png" alt="logo" />
        </div>
        <div className="justify-start items-center gap-2.5 flex">
          <a
            href="/privacy-policy"
            className="text-[#8C8C8C] hover:text-white transition-colors duration-200 font-mono text-sm"
          >
            Privacy Policy
          </a>
          <div className="w-[1px] h-4 bg-[#707070]" />
          <a
            href="/terms-of-service"
            className="text-[#8C8C8C] hover:text-white transition-colors duration-200 font-mono text-sm"
          >
            Terms of Service
          </a>
          <div className="w-[1px] h-4 bg-[#707070]" />
          <a
            href="/fees"
            className="text-[#8C8C8C] hover:text-white transition-colors duration-200 font-mono text-sm"
          >
            Fees
          </a>
        </div>
        <div className="w-8 h-8 p-2 rounded-lg border border-[#f1f1f1] justify-center items-center gap-2 flex hover:bg-white/10 transition-colors duration-200 cursor-pointer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 16 14"
          >
            <path
              fill="#fff"
              d="M12.218.27h2.249L9.553 5.885l5.78 7.642h-4.525L7.263 8.892l-4.056 4.635H.957L6.211 7.52.667.27h4.64l3.205 4.236zm-.79 11.91h1.246L4.63 1.546H3.293z"
            ></path>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default Footer;
