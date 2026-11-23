"use client";

import { useRef, useState } from "react";
import { beginSubmission, deleteMySubmission, finalizeSubmission } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, mimeFromFile } from "@/lib/utils";
import { ConfirmDialog, Tag, useRunner, useToast, ViewablePhoto } from "@/components/ui";
import { pad3 } from "@/lib/utils";

type Props = {
  categoryId: number;
  label: string;
  hasPhoto: boolean;
  url?: string;
  fileName?: string | null;
  uploadedOn?: string | null;
  photoNumber: number;
  canEdit: boolean;
};

const MAX = 8 * 1024 * 1024;

export function CategoryCard(p: Props) {
  const toast = useToast();
  const { run, busy, setBusy } = useRunner();
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX) {
      toast("err", "A fotografia não pode exceder 8 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    if (!mimeFromFile(file).startsWith("image/")) {
      toast("err", "O ficheiro tem de ser uma imagem.");
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true);
    try {
      // 1) o servidor valida o estado do concurso; 2) o ficheiro vai direto para o storage; 3) o servidor valida o ficheiro guardado.
      const begun = await beginSubmission(p.categoryId);
      if (!begun.ok) return void toast("err", begun.error);
      const id = begun.data as string;
      const contentType = mimeFromFile(file);
      const { error } = await createClient().storage.from("fotografias").upload(id, file, { upsert: true, contentType });
      if (error) return void toast("err", "Não foi possível guardar a fotografia. Tenta novamente.");
      const done = await finalizeSubmission(id, file.name, contentType);
      toast(done.ok ? "ok" : "err", done.ok ? done.message ?? "Fotografia guardada." : done.error);
    } catch {
      toast("err", "Não foi possível guardar a fotografia. Tenta novamente.");
    } finally {
      if (input.current) input.current.value = "";
      setBusy(false);
      window.location.reload();
    }
  }

  return (
    <div className="card">
      <div className="card-title">{p.label}</div>
      <div style={{ margin: "8px 0" }}>
        {p.hasPhoto ? <Tag kind="green">Fotografia carregada</Tag> : <Tag kind="neutral">Sem fotografia</Tag>}
      </div>
      {p.hasPhoto && p.url && (
        <>
          <ViewablePhoto src={p.url} title={p.photoNumber ? `Fotografia Nº ${pad3(p.photoNumber)}` : "Fotografia"} />
          <div className="muted" style={{ marginTop: 6 }}>
            <div>{p.fileName}</div>
            <div>{formatDateTime(p.uploadedOn)}</div>
          </div>
        </>
      )}
      {p.canEdit && (
        <div className="row" style={{ marginTop: 12 }}>
          {busy ? (
            <span className="muted">A processar...</span>
          ) : (
            <>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" className={`btn ${p.hasPhoto ? "" : "btn-primary"}`} onClick={() => input.current?.click()}>
                {p.hasPhoto ? "Substituir" : "Carregar fotografia"}
              </button>
              {p.hasPhoto && <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>Eliminar</button>}
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        text="Eliminar a fotografia desta categoria?"
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => deleteMySubmission(p.categoryId), { failText: "Não foi possível eliminar a fotografia. Tenta novamente." });
        }}
      />
    </div>
  );
}
