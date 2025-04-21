import { useLocalStorage } from "@solana/wallet-adapter-react";
import { useNavigate } from "react-router";

export const useTosAccepted = () => {
  const [tosAccepted, setTosAccepted] = useLocalStorage<boolean>(
    "tosAccepted",
    false
  );
  const navigate = useNavigate();

  const acceptTos = () => {
    setTosAccepted(true);
    navigate("/");
  };

  return { tosAccepted, acceptTos };
};
