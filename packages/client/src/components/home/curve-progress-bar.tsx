
interface CurveProgressBarProps {
   progress: number;
}

const CurveProgressBar = ({ progress }: CurveProgressBarProps) => {
   const pct = Math.max(0, Math.min(progress, 100));
   const ANGLE = 6;
   const clip = `polygon(
      ${ANGLE}px 0%, 
      100% 0%, 
      calc(100% - ${ANGLE}px) 100%, 
      0% 100%
    )`;
   
    const clipChild = `polygon(
      ${ANGLE - 2}px 0%, 
      100% 0%, 
      calc(100% - ${ANGLE - 2}px) 100%, 
      0% 100%
    )`;

   return (
      <div className="w-full px-1 pt-2 pb-0">

         <div className="relative w-full  h-[18.76px]  overflow-hidden  bg-gradient-to" style={{
            clipPath: clip,
            border: "1px solid white",
            backgroundColor: "white",
         }}>

            <div className="absolute inset-0 bg-[#171717]" style={{ clipPath: clip }} />

            <div className="absolute inset-[3px] overflow-hidden">
               <div
                  className="h-full bg-gradient-to-r from-[#013902] to-[#00FF04] transition-[width] duration-300 ease-in-out"
                  style={{ width: `${pct}%`, clipPath: clipChild, }}
               />
            </div>
         </div>
      </div>
   );
};

export default CurveProgressBar;
