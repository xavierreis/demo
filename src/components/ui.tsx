"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/types";

// ------------------------------------------------------------------ mensagens
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastCtx = createContext<(kind: "ok" | "err", text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((kind: "ok" | "err", text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "err" ? "alert" : "status"}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// Executa uma ação de servidor: ocupado → chamada → mensagem → atualizar dados → libertar.
export function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts?: { refresh?: boolean; failText?: string }) => {
      setBusy(true);
      try {
        const res = await fn();
        if (res.ok) {
          if (res.message) toast("ok", res.message);
        } else {
          toast("err", res.error);
        }
        if (opts?.refresh !== false) router.refresh();
        return res;
      } catch {
        toast("err", opts?.failText ?? "Não foi possível concluir a operação. Tenta novamente.");
        return { ok: false, error: "" } as ActionResult<T>;
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );
  return { run, busy, setBusy };
}

// ---------------------------------------------------------------- componentes
export function Tag({ kind, children }: { kind: "neutral" | "green" | "red" | "primary"; children: ReactNode }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}

export function StatusTag({ status }: { status: string }) {
  if (status === "a_decorrer") return <Tag kind="green">A decorrer</Tag>;
  if (status === "encerrado") return <Tag kind="red">Encerrado</Tag>;
  return <Tag kind="neutral">Por iniciar</Tag>;
}

export function ConfirmDialog(props: {
  open: boolean;
  title?: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);
  if (!props.open) return null;
  return (
    <div className="overlay" onClick={props.onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {props.title && <div className="dialog-title">{props.title}</div>}
        <div className="dialog-text">{props.text}</div>
        {props.children}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onCancel}>Cancelar</button>
          <button
            type="button"
            className={`btn ${props.danger ? "btn-danger" : "btn-primary"}`}
            disabled={props.confirmDisabled}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Visualizador de fotografia em ecrã inteiro (sem cortes), com zoom, Esc e fecho.
export function PhotoViewer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pv-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="pv-backdrop" aria-label="Fechar" tabIndex={-1} onClick={onClose} />
      <div className={zoomed ? "pv-stage pv-zoomed" : "pv-stage"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} className={zoomed ? "pv-img pv-img-zoom" : "pv-img"} />
      </div>
      <button type="button" className="pv-close" aria-label="Fechar" onClick={onClose}>✕</button>
      <div className="pv-bar">
        <span className="pv-caption">{title}</span>
        <button type="button" className="pv-toggle" onClick={() => setZoomed((z) => !z)}>
          {zoomed ? "Reduzir" : "Ampliar"}
        </button>
      </div>
    </div>
  );
}

// Miniatura com selo "Ver" que abre o visualizador.
export function ViewablePhoto({ src, title, className }: { src: string; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pv-tap" aria-label="Ver fotografia em ecrã completo" onClick={() => setOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} className={className ?? "thumb"} loading="lazy" />
        <span className="pv-badge">Ver</span>
      </button>
      {open && <PhotoViewer src={src} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

// Botão que corre uma ação de servidor sobre o servidor e atualiza a página.
export function ActionButton(props: {
  action: () => Promise<ActionResult>;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  const { run, busy } = useRunner();
  return (
    <button type="button" className={props.className ?? "btn"} disabled={busy || props.disabled} title={props.title}
      onClick={() => run(props.action)}>
      {busy ? "A processar..." : props.children}
    </button>
  );
}

export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  return <button type="button" className={className ?? "btn"} onClick={() => router.refresh()}>Atualizar</button>;
}
