import { ReactNode } from "react";

export enum ModalType {
  NONE = "none",
  LAUNCHING_TOKEN = "launching-token",
}

// generic Props type
export type Props<
  State extends string = string,
  TProps = Record<string, unknown>,
> = {
  state: State;
  props: TProps;
};

export type ExtractState<T> = T extends { state: infer S } ? S : never;
export type ExtractProps<T> = T extends { props: infer P } ? P : never;

export type ModalProps<Modal extends ModalType = ModalType> =
  Modal extends ModalType.LAUNCHING_TOKEN
    ? {
        state: ModalType.LAUNCHING_TOKEN;
        props: { symbol: string };
      }
    : { state: Modal; props: Record<never, never> }; // default props is empty

// zustand state for modals
export type ModalState = {
  changeModal: <T extends ModalType>(
    open: boolean,
    modalState: T,
    props: ExtractProps<Extract<ModalProps<T>, { state: T }>>,
  ) => void;
  resetModal: () => void;
  setOpen: (open: boolean) => void;
  open: boolean;
  Modal: ReactNode | null;
};

// Type for a object of modal types and their corresponding props types
export type ModalsDict = {
  [K in ExtractState<ModalProps>]: ModalFunctionComponent<
    K,
    ExtractProps<Extract<ModalProps, { state: K }>>
  >;
};

// Create a type for modal components
type ModalFunctionComponent<
  T extends ModalType,
  TProps extends Record<string, unknown>,
> =
  Props<T, TProps> extends { props: infer P } ? (props: P) => ReactNode : never;
