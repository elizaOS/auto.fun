import { Search } from "lucide-react";

export default function SearchBar() {

    return (
      <div className="relative w-[290px] lg:w-[330px] md:w-[430px] flex-1">
        <div className="flex items-center h-11 w-full px-2 gap-2 bg-[#171717] border border-[#262626] rounded-md hover:border-[#2FD345]/50 focus-within:border-[#2FD345]/50 transition-colors">
          <Search className="w-6 h-6 text-[#8C8C8C] group-hover:text-[#2FD345]" />
          <input
            type="text"
            value=""
            placeholder="Symbol or Address..."
            className="flex-1 bg-transparent text-base font-medium text-[#8C8C8C] placeholder-[#8C8C8C] focus:outline-none hover:placeholder-white focus:placeholder-white transition-colors font-satoshi placeholder:font-satoshi focus:font-satoshi"
          />
        </div>
      </div>
    );
  };
  