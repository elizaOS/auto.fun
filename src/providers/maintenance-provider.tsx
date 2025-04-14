import { getMaintenanceMode } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { PropsWithChildren } from "react";

export default function MainentenaceProvider({ children }: PropsWithChildren) {
  const query = useQuery({
    queryKey: ["maintenance-mode"],
    queryFn: getMaintenanceMode,
  });

  const data: { enabled: boolean } = query?.data as unknown as any;

  const isEnabled = data?.enabled === true || false;

  if (isEnabled)
    return (
      <div className="h-screen flex items-center justify-center text-white">
        <div className="flex items-center flex-col gap-4">
          <h1 className="text-2xl">Auto.fun</h1>
          <h2 className="text-base">
            We are undergoing maintenance and will be back soon.
          </h2>
        </div>
      </div>
    );
  return children;
}
