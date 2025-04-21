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
        <div className="flex items-center flex-col gap-4 p-4">
          <img
            src="/logo.png"
            height={128}
            width={128}
            alt="logo"
            className="size-24"
          />
          <h2 className="text-base text-center whitespace-pre-line">
            We are undergoing maintenance.{"\n"}Will be back soon.
          </h2>
        </div>
      </div>
    );
  return children;
}
