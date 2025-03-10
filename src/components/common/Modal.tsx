import type { FC, MouseEvent } from "react";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  className?: string;
  container?: string;
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  title?: string;
  allowClose?: boolean;
  maxWidth?: number | string;
  contentClassName?: string;
}

export const Modal: FC<ModalProps> = ({
  className = "",
  container = "body",
  isOpen,
  onClose,
  children,
  title,
  allowClose = true,
  maxWidth,
  contentClassName,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [portal, setPortal] = useState<Element | null>(null);

  const hideModal = useCallback(() => {
    if (!allowClose) return;

    setFadeIn(false);
    setTimeout(() => onClose?.(), 150);
  }, [onClose, allowClose]);

  const handleClose = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      hideModal();
    },
    [hideModal],
  );

  const handleTabKey = useCallback(
    (event: KeyboardEvent) => {
      const node = ref.current;
      if (!node) return;

      const focusableElements = node.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    },
    [ref],
  );

  useLayoutEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideModal();
      } else if (event.key === "Tab") {
        handleTabKey(event);
      }
    };

    const { overflow } = window.getComputedStyle(document.body);
    setTimeout(() => setFadeIn(true), 0);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown, false);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", handleKeyDown, false);
    };
  }, [isOpen, hideModal, handleTabKey]);

  useLayoutEffect(
    () => setPortal(document.querySelector(container)),
    [container],
  );

  const handleOverlayClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      onClose?.();
    },
    [onClose],
  );

  if (!isOpen || !portal) return null;

  return createPortal(
    <div
      aria-modal="true"
      className={`wallet-adapter-modal ${fadeIn && "wallet-adapter-modal-fade-in"}`}
      ref={ref}
      role="dialog"
    >
      <div className="wallet-adapter-modal-container">
        <div
          className={`wallet-adapter-modal-wrapper ${className}`}
          style={{
            maxWidth: maxWidth,
            width: "100%",
          }}
        >
          {(title || allowClose) && (
            <div className="wallet-adapter-modal-header">
              {title && (
                <div className="wallet-adapter-modal-header-left">{title}</div>
              )}
              {allowClose && (
                <button
                  onClick={handleClose}
                  className="wallet-adapter-modal-button-close"
                >
                  <svg width="14" height="14">
                    <path d="M14 12.461 8.3 6.772l5.234-5.233L12.006 0 6.772 5.234 1.54 0 0 1.539l5.234 5.233L0 12.006l1.539 1.528L6.772 8.3l5.69 5.7L14 12.461z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <div className={`wallet-adapter-modal-content ${contentClassName}`}>
            {children}
          </div>
        </div>
      </div>
      <div
        className="wallet-adapter-modal-overlay"
        onClick={allowClose ? handleOverlayClick : undefined}
      />
    </div>,
    portal,
  );
};
