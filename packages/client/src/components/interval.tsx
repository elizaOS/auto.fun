import { useInterval } from "@/hooks/use-interval";

export default function Interval({
  ms,
  resolver,
}: {
  ms: number;
  resolver: any;
}) {
  const value = useInterval({ ms, resolver });
  return value;
}
