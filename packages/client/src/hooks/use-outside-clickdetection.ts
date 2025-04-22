import { RefObject, useEffect } from "react";

/**
 * Fires an event when user clicks outside of a given list of elements.
 * @param refs Elements to detect a click outside of.
 * @param doOnOutsideClick An event fired when outside of a list of elements is clicked.
 */
export const useOutsideClickDetection = (
  refs: RefObject<HTMLElement | null>[],
  doOnOutsideClick: () => void,
) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        if (
          ref &&
          ref.current &&
          event.target instanceof Node &&
          ref.current.contains(event.target)
        )
          return;
      }

      doOnOutsideClick();
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [refs, doOnOutsideClick]);
};
