"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  adminSaveVote, adminUpdateSubmission, listCategorySubmissions, removeStatementImage, saveStatement,
  setStatementImage, setUserRole,
} from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog, useRunner, useToast } from "@/components/ui";
import { mimeFromFile } from "@/lib/utils";

// ------------------------------------------------------------------- enunciados
export function StatementEditor(p: {
  categoryId: number; label: string; title: string; subtitle: string; body: string; credits: string; hasImage: boolean; imageUrl?: string;
}) {
  const toast = useToast();
  const { run, busy, setBusy } = useRunner();
  const [f, setF] = useState({ title: p.title, subtitle: p.subtitle, body: p.body, credits: p.credits });
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return void toast("err", "A imagem excede 5 MB.");
    const contentType = mimeFromFile(file);
    if (!contentType.startsWith("image/")) return void toast("err", "O ficheiro tem de ser uma imagem.");
    setBusy(true);
    try {
      const { error } = await createClient().storage.from("enunciados").upload(String(p.categoryId), file, { upsert: true, contentType });
      if (error) throw error;
      const res = await setStatementImage(p.categoryId, contentType);
      toast(res.ok ? "ok" : "err", res.ok ? res.message ?? "Imagem guardada." : res.error);
    } catch {
      toast("err", "Não foi possível guardar a imagem. Tenta novamente.");
    } finally {
      if (input.current) input.current.value = "";
      setBusy(false);
      window.location.reload();
    }
  }

  return (
    <div className="card">
      <div className="card-title">{p.label}</div>
      <div className="field"><label>Título</label><input type="text" maxLength={250} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label>Subtítulo</label><input type="text" maxLength={250} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></div>
      <div className="field"><label>Texto</label><textarea rows={10} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div className="field"><label>Créditos</label><input type="text" maxLength={500} value={f.credits} onChange={(e) => setF({ ...f, credits: e.target.value })} /></div>
      <button className="btn btn-primary" disabled={busy}
        onClick={() => run(() => saveStatement(p.categoryId, f.title, f.subtitle, f.body, f.credits), { refresh: false, failText: "Não foi possível guardar o enunciado. Tenta novamente." })}>
        Guardar
      </button>
      <div style={{ marginTop: 16 }}>
        <div className="muted">Imagem do enunciado (opcional, até 5 MB)</div>
        {p.hasImage && p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt="Pré-visualização da imagem do enunciado" className="thumb" style={{ margin: "8px 0" }} />
          : <div className="muted" style={{ margin: "8px 0" }}>Sem imagem.</div>}
        <div className="row">
          {busy ? <span className="muted">A processar...</span> : (
            <>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
              <button className="btn" onClick={() => input.current?.click()}>Carregar imagem</button>
              {p.hasImage && <button className="btn btn-outline-danger" onClick={() => setConfirm(true)}>Remover imagem</button>}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm} text="Remover a imagem deste enunciado?" confirmLabel="Remover" danger onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); run(() => removeStatementImage(p.categoryId), { failText: "Não foi possível remover a imagem. Tenta novamente." }); }} />
    </div>
  );
}

// ------------------------------------------------------------------ utilizadores
export function RoleToggle(p: { userId: string; role: "administrator" | "participant"; on: boolean; name: string; disabled?: boolean; title?: string }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = useState(false);
  const label = p.role === "administrator" ? "Administrador" : "Utilizador";
  const who = p.name || "este utilizador";
  const text = p.role === "administrator"
    ? `${p.on ? "Retirar" : "Dar"} permissão de administrador a ${who}?`
    : p.on ? `Retirar permissão de utilizador a ${who}? Deixa de poder submeter fotografias e votar.` : `Dar permissão de utilizador a ${who}?`;
  return (
    <>
      <button type="button" className={p.on ? "toggle on" : "toggle"} aria-pressed={p.on} disabled={busy || p.disabled} title={p.title} onClick={() => setOpen(true)}>
        {p.on ? "✓ " : ""}{label}
      </button>
      <ConfirmDialog open={open} text={text} confirmLabel="Confirmar" onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); run(() => setUserRole(p.userId, p.role, !p.on), { failText: "Não foi possível alterar a permissão. Tenta novamente." }); }} />
    </>
  );
}

// ------------------------------------------------------------------------- votos
type Opt = { id: string; label: string };

export function VoteForm(p: {
  voteId: number | null; voters: Opt[]; categories: { id: number; label: string }[];
  initial: { voterId: string; categoryId: number; submissionId: string; score: number };
  submissions: Opt[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, busy } = useRunner();
  const [voter, setVoter] = useState(p.initial.voterId);
  const [cat, setCat] = useState(p.initial.categoryId);
  const [sub, setSub] = useState(p.initial.submissionId);
  const [score, setScore] = useState(String(p.initial.score || ""));
  const [subs, setSubs] = useState(p.submissions);

  async function changeCategory(id: number) {
    setCat(id);
    setSub("");
    const res = await listCategorySubmissions(id);
    if (res.ok && res.data) setSubs(res.data.map((s) => ({ id: s.submission_id, label: s.label })));
    else if (!res.ok) toast("err", res.error);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!voter || !sub || !score) return void toast("err", "Preenche todos os campos obrigatórios.");
    const res = await run(() => adminSaveVote(p.voteId, voter, sub, Number(score)), { refresh: false, failText: "Não foi possível guardar o voto. Tenta novamente." });
    if (res.ok) { router.push("/admin/votos"); router.refresh(); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <div className="field"><label htmlFor="v">Votante</label>
        <select id="v" value={voter} onChange={(e) => setVoter(e.target.value)} required>
          <option value="">Seleciona...</option>{p.voters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></div>
      <div className="field"><label htmlFor="c">Categoria</label>
        <select id="c" value={cat} onChange={(e) => changeCategory(Number(e.target.value))} disabled={p.voteId !== null}>
          {p.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select></div>
      <div className="field"><label htmlFor="s">Fotografia</label>
        <select id="s" value={sub} onChange={(e) => setSub(e.target.value)} required>
          <option value="">Seleciona...</option>{subs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></div>
      <div className="field"><label htmlFor="p">Pontuação (1 a 5)</label>
        <input id="p" type="number" min={1} max={5} required value={score} onChange={(e) => setScore(e.target.value)} /></div>
      <div className="row">
        <Link href="/admin/votos" className="btn">Voltar</Link>
        <button className="btn btn-primary" disabled={busy}>{busy ? "A guardar..." : "Guardar"}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- fotografias
export function SubmissionForm(p: { submissionId: string; fileName: string; photoNumber: number }) {
  const router = useRouter();
  const { run, busy } = useRunner();
  const [name, setName] = useState(p.fileName);
  const [num, setNum] = useState(String(p.photoNumber));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run(() => adminUpdateSubmission(p.submissionId, name, Number(num)), { refresh: false, failText: "Não foi possível guardar a fotografia. Tenta novamente." });
    if (res.ok) { router.push("/admin/fotografias"); router.refresh(); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <div className="field"><label htmlFor="fn">Nome do ficheiro</label>
        <input id="fn" type="text" maxLength={250} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="pn">Número da fotografia</label>
        <input id="pn" type="number" min={0} required value={num} onChange={(e) => setNum(e.target.value)} /></div>
      <div className="row">
        <Link href="/admin/fotografias" className="btn">Voltar</Link>
        <button className="btn btn-primary" disabled={busy}>{busy ? "A guardar..." : "Guardar"}</button>
      </div>
    </form>
  );
}
