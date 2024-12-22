import { io, Socket } from "socket.io-client";
import { CONTRACT_API_URL } from "./env";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(CONTRACT_API_URL);
  }
  return socket;
};
