import Chart from "../chart";
import { TVChartContainer } from "./tv-chart-container";
import { useScript } from "@uidotdev/usehooks";

interface TradingChartProps {
  name: string;
  token: string;
}

export const TradingViewChart: React.FC<TradingChartProps> = ({
  name,
  token,
}) => {
  const status = useScript("/udf.js", {
    removeOnUnmount: false,
  });

  return (
    <>
      {status === "ready" && (
        <TVChartContainer name={name} pairIndex={10} token={token} />
      )}
      <Chart mint={token} />
    </>
  );
};
