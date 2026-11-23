"use client";

import { useState } from "react";
import {
  closeSubmissions, deleteAllPhotos, deleteAllVotes, getDownloadUrl, numberPhotos, openSubmissions,
  resetContest, setCategoryStatus, setFinalStatus, addCandidate, removeCandidate, selectWinners, startContest,
} from "@/lib/actions";
import { ConfirmDialog, StatusTag, Tag, useRunner, useToast } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

// ------------------------------------------------------------ estado do concurso
type Dlg = "start" | "toggle" | "number" | "photos" | "votes" | "reset" | null;

export function ContestControls(p: { started: boolean; closed: boolean; startedOn: string | null; closedOn: string | null }) {
  const { run, busy } = useRunner();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [text, setText] = useState("");
  const close = () => { setDlg(null); setText(""); };

  const confirm = () => {
    const d = dlg;
    close();
    if (d === "start") run(() => startContest(), { failText: "Não foi possível iniciar o concurso. Tenta novamente." });
    if (d === "toggle") run(() => (p.closed ? openSubmissions() : closeSubmissions()), { failText: "Não foi possível alterar o estado. Tenta novamente." });
    if (d === "number") run(() => numberPhotos(), { failText: "Não foi possível numerar as fotografias. Tenta novamente." });
    if (d === "photos") run(() => deleteAllPhotos());
    if (d === "votes") run(() => deleteAllVotes());
    if (d === "reset") run(() => resetContest());
  };
  const dangerText = {
    reset: "Esta ação apaga TODAS as fotografias, votos, candidatas e votação final e volta a pôr o concurso por iniciar. Não apaga utilizadores nem perfis. Não pode ser desfeita.",
    photos: "Apagar todas as fotografias? Também apaga os votos e as candidaturas e repõe as votações para «por iniciar». Não pode ser desfeito.",
    votes: "Apagar todos os votos? Também apaga as candidaturas ao Prémio final e repõe as votações para «por iniciar». Não pode ser desfeito.",
  } as const;
  const texts: Record<Exclude<Dlg, null>, string> = {
    start: "Iniciar o concurso? Os participantes passam a poder carregar fotografias.",
    toggle: p.closed
      ? "Reabrir as submissões? Os participantes voltam a poder carregar, substituir e eliminar fotografias."
      : "Encerrar as submissões? Os participantes deixam de poder carregar, substituir ou eliminar fotografias.",
    number: "Numerar as fotografias de cada categoria por ordem de carregamento? Os números existentes serão recalculados.",
    ...dangerText,
  };
  const titles: Partial<Record<Exclude<Dlg, null>, string>> = {
    reset: "Repor o sistema?", photos: "Apagar todas as fotografias?", votes: "Apagar todas as votações?",
  };
  const labels: Record<Exclude<Dlg, null>, string> = {
    start: "Iniciar", toggle: p.closed ? "Reabrir" : "Encerrar", number: "Numerar", photos: "Apagar tudo", votes: "Apagar tudo", reset: "Repor tudo",
  };
  const isReset = dlg === "reset";

  return (
    <div className="card">
      <div className="card-title">Estado do concurso</div>
      <div style={{ margin: "8px 0" }}>
        {p.closed ? (
          <><Tag kind="red">Submissões encerradas</Tag> <span className="muted">Encerradas em {formatDateTime(p.closedOn)}</span></>
        ) : p.started ? (
          <><Tag kind="green">Submissões abertas</Tag> <span className="muted">Iniciado em {formatDateTime(p.startedOn)}</span></>
        ) : (
          <Tag kind="neutral">Concurso por iniciar</Tag>
        )}
      </div>
      <div className="row">
        {busy ? <span className="muted">A processar...</span> : (
          <>
            {p.closed ? (
              <button className="btn" onClick={() => setDlg("toggle")}>Reabrir submissões</button>
            ) : p.started ? (
              <button className="btn btn-danger" onClick={() => setDlg("toggle")}>Encerrar submissões</button>
            ) : (
              <button className="btn btn-primary" onClick={() => setDlg("start")}>Iniciar concurso</button>
            )}
            <button className="btn btn-primary" onClick={() => setDlg("number")}>Numerar fotografias</button>
          </>
        )}
        <button className="btn btn-outline-danger" onClick={() => setDlg("photos")}>Apagar todas as fotos</button>
        <button className="btn btn-outline-danger" onClick={() => setDlg("votes")}>Apagar todas as votações</button>
      </div>
      <div className="danger">
        <div className="danger-title">Zona de perigo</div>
        <p className="muted">Ações irreversíveis. Usa apenas para repor o concurso antes de um novo teste ou edição.</p>
        <button className="btn btn-danger" disabled={busy} onClick={() => setDlg("reset")}>Repor sistema</button>
      </div>
      <ConfirmDialog
        open={dlg !== null}
        title={dlg ? titles[dlg] : undefined}
        text={dlg ? texts[dlg] : ""}
        confirmLabel={dlg ? labels[dlg] : ""}
        danger={dlg === "toggle" ? !p.closed : dlg === "photos" || dlg === "votes" || dlg === "reset"}
        confirmDisabled={isReset && text.trim().toUpperCase() !== "REPOR"}
        onCancel={close}
        onConfirm={confirm}
      >
        {isReset && (
          <div className="field">
            <label htmlFor="rp">Escreve REPOR para confirmar</label>
            <input id="rp" type="text" maxLength={20} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

// ----------------------------------------------------------------- descarregar
export function DownloadButton({ submissionId, className }: { submissionId: string; className?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className ?? "btn btn-primary btn-sm"} disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await getDownloadUrl(submissionId);
        setBusy(false);
        if (res.ok && res.data) window.location.assign(res.data.url);
        else if (!res.ok) toast("err", res.error);
      }}>
      Descarregar
    </button>
  );
}

// ------------------------------------------------------ votação por categoria
export function CategoryStateRow(p: { categoryId: number; label: string; status: string; photoCount: number; unnumbered: number; votes: number }) {
  const { run, busy } = useRunner();
  const [mode, setMode] = useState<1 | 2 | 3 | null>(null);
  const target = mode === 1 || mode === 3 ? "a_decorrer" : "encerrado";
  const texts = {
    1: "Abrir a votação desta categoria? Os participantes passam a poder votar.",
    2: "Encerrar a votação desta categoria? Os participantes deixam de poder alterar os votos.",
    3: "Reabrir a votação desta categoria?",
  };
  const labels = { 1: "Abrir votação", 2: "Encerrar votação", 3: "Reabrir votação" };
  return (
    <div className="card">
      <div className="row-between">
        <div>
          <div className="card-title">{p.label}</div>
          <div className="row muted">
            <StatusTag status={p.status} />
            <span>{p.photoCount} {p.photoCount === 1 ? "fotografia" : "fotografias"}</span>
            {p.unnumbered > 0 && <span className="warn">{p.unnumbered} sem número</span>}
            <span>{p.votes} {p.votes === 1 ? "voto" : "votos"}</span>
          </div>
          {p.photoCount < 5 && (
            <div className="warn">Só tem {p.photoCount} {p.photoCount === 1 ? "fotografia" : "fotografias"}: os participantes não conseguem usar as 5 pontuações.</div>
          )}
        </div>
        {busy ? <span className="muted">A processar...</span> : (
          <>
            {p.status === "por_iniciar" && <button className="btn btn-primary" onClick={() => setMode(1)}>Abrir votação</button>}
            {p.status === "a_decorrer" && <button className="btn btn-danger" onClick={() => setMode(2)}>Encerrar votação</button>}
            {p.status === "encerrado" && <button className="btn" onClick={() => setMode(3)}>Reabrir votação</button>}
          </>
        )}
      </div>
      <ConfirmDialog open={mode !== null} text={mode ? texts[mode] : ""} confirmLabel={mode ? labels[mode] : ""} danger={mode === 2}
        onCancel={() => setMode(null)}
        onConfirm={() => {
          const m = mode!;
          setMode(null);
          run(() => setCategoryStatus(p.categoryId, target, m), { failText: "Não foi possível alterar o estado da votação. Tenta novamente." });
        }} />
    </div>
  );
}

// ------------------------------------------------------------- votação final
export function FinalStatusPanel(p: { status: string; candidateCount: number; totalVoters: number }) {
  const { run, busy } = useRunner();
  const [kind, setKind] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const texts = {
    1: "Abrir a votação final? Os participantes passam a poder escolher a sua fotografia favorita.",
    2: "Encerrar a votação final? Os participantes deixam de poder votar.",
    3: "Reabrir a votação final?",
    4: "Voltar a pôr a votação final por iniciar? Poderás voltar a alterar os candidatos.",
    5: "Adicionar como candidatas as fotografias em 1.º lugar de cada categoria encerrada?",
  };
  const statusFor = { 1: "a_decorrer", 2: "encerrado", 3: "a_decorrer", 4: "por_iniciar" } as const;
  const pill = p.status === "a_decorrer" ? "pill pill-prov" : p.status === "encerrado" ? "pill pill-final" : "pill pill-idle";
  return (
    <>
      <div className="row-between">
        <div className="row">
          <span className={pill}>{p.status === "a_decorrer" ? "A decorrer" : p.status === "encerrado" ? "Encerrado" : "Por iniciar"}</span>
          <span className="muted">{p.candidateCount} {p.candidateCount === 1 ? "candidata" : "candidatas"}</span>
        </div>
        <div className="row">
          {p.status === "por_iniciar" && <>
            <button className="btn" disabled={busy} onClick={() => setKind(5)}>Selecionar 1.os lugares</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => setKind(1)}>Abrir votação final</button>
          </>}
          {p.status === "a_decorrer" && <>
            <button className="btn btn-danger" disabled={busy} onClick={() => setKind(2)}>Encerrar votação final</button>
            {p.totalVoters === 0 && <button className="btn btn-ghost" disabled={busy} onClick={() => setKind(4)}>Voltar a por iniciar</button>}
          </>}
          {p.status === "encerrado" && <button className="btn" disabled={busy} onClick={() => setKind(3)}>Reabrir votação final</button>}
        </div>
      </div>
      <ConfirmDialog open={kind !== null} text={kind ? texts[kind] : ""} confirmLabel="Confirmar" onCancel={() => setKind(null)}
        onConfirm={() => {
          const k = kind!;
          setKind(null);
          run(() => (k === 5 ? selectWinners() : setFinalStatus(statusFor[k], k)), { failText: "Não foi possível concluir a operação. Tenta novamente." });
        }} />
    </>
  );
}

export function CandidateToggle({ submissionId, isCandidate, locked }: { submissionId: string; isCandidate: boolean; locked: boolean }) {
  const { run, busy } = useRunner();
  const fail = { failText: "Não foi possível alterar os candidatos. Tenta novamente." };
  return (
    <button type="button" className={isCandidate ? "toggle on" : "toggle"} aria-pressed={isCandidate}
      disabled={busy || locked} title={locked ? "A votação final já começou." : ""}
      onClick={() => run(() => (isCandidate ? removeCandidate(submissionId) : addCandidate(submissionId)), fail)}>
      {isCandidate ? "✓ Candidata" : "Adicionar"}
    </button>
  );
}

export function RemoveCandidateButton({ submissionId, locked }: { submissionId: string; locked: boolean }) {
  const { run, busy } = useRunner();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy || locked} title={locked ? "A votação final já começou." : ""}
      onClick={() => run(() => removeCandidate(submissionId), { failText: "Não foi possível alterar os candidatos. Tenta novamente." })}>
      Remover
    </button>
  );
}
