import { PropsWithChildren } from "react";

export default function TosProvider({ children }: PropsWithChildren) {
  const localStorageSave = true;

  return localStorageSave ? (
    <>{children}</>
  ) : (
    <div>Accept the terms</div>
  );
}
