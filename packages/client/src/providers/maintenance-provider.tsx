export default function MainentenaceProvider() {
  const isEnabled = import.meta.env.VITE_MAINTENANCE_MODE
    ? Boolean(import.meta.env.VITE_MAINTENANCE_MODE)
    : false;

  if (isEnabled)
    return (
      <div className="fixed w-screen h-screen bg-autofun-background-action-primary z-[1000] flex items-center justify-center text-white">
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
  return null;
}
