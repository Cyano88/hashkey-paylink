import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Confirmation = { title: string; description: string; action: string };

export function useStreamConfirm() {
  const [options, setOptions] = useState<Confirmation>();
  const pending = useRef<(accepted: boolean) => void>();
  const confirm = useCallback((next: Confirmation) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOptions(next);
    });
  }, []);
  const close = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    pending.current = undefined;
    setOptions(undefined);
    resolve?.(accepted);
  }, []);
  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = undefined;
    },
    [],
  );
  return {
    confirm,
    confirmation: options ? (
      <StreamConfirmSheet options={options} close={close} />
    ) : null,
  };
}

function StreamConfirmSheet({
  options,
  close,
}: {
  options: Confirmation;
  close: (accepted: boolean) => void;
}) {
  const titleId = useId(),
    descriptionId = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && !node.contains(panel.current),
      )
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => {
      node.inert = true;
    });
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = () => close(false);
    const nativeBack = (event: Event) => {
      event.preventDefault();
      dismiss();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
      if (event.key !== "Tab") return;
      const controls =
        panel.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("hashpaystream:back", nativeBack);
    window.addEventListener("popstate", dismiss);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("hashpaystream:back", nativeBack);
      window.removeEventListener("popstate", dismiss);
      background.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [close]);
  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close(false);
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border border-zinc-200 bg-[#f6f6f3] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-zinc-950 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111111] dark:text-white"
      >
        <span
          aria-hidden="true"
          className="mx-auto block h-1 w-10 rounded-full bg-zinc-300 dark:bg-white/20"
        />
        <h2 id={titleId} className="mt-5 text-lg font-black">
          {options.title}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-xs leading-5 text-zinc-500 dark:text-white/50"
        >
          {options.description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="min-h-11 rounded-full border border-zinc-300 px-4 text-xs font-bold dark:border-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="min-h-11 rounded-full bg-zinc-950 px-4 text-xs font-bold text-white dark:bg-white dark:text-zinc-950"
          >
            {options.action}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
