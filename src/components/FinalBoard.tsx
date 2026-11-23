"use client";

import { removeFinalVote, saveFinalVote } from "@/lib/actions";
import { photoLabel } from "@/lib/utils";
import { Tag, useRunner, ViewablePhoto } from "@/components/ui";

export type Candidate = { submissionId: string; categoryLabel: string; photoNumber: number; isMyChoice: boolean; url?: string };

export function FinalBoard({ candidates }: { candidates: Candidate[] }) {
  const { run, busy } = useRunner();
  const choice = candidates.find((c) => c.isMyChoice);
  return (
    <div className="stack">
      <p className="intro">
        Escolhe a tua fotografia favorita entre as finalistas. Só podes escolher uma, mas podes mudar de ideias enquanto a
        votação estiver aberta.
      </p>
      <b>{choice ? `A tua escolha: ${choice.categoryLabel} · ${photoLabel(choice.photoNumber)}` : "Ainda não escolheste."}</b>
      {candidates.length === 0 ? <div className="state">Ainda não há fotografias finalistas.</div> : (
        <div className="grid">
          {candidates.map((c) => (
            <div className="card" key={c.submissionId}>
              {c.url && <ViewablePhoto src={c.url} title={`${c.categoryLabel} · ${photoLabel(c.photoNumber)}`} />}
              <div className="card-title" style={{ margin: "8px 0" }}>{c.categoryLabel} · {photoLabel(c.photoNumber)}</div>
              {c.isMyChoice ? (
                <div className="row">
                  <Tag kind="green">A tua favorita</Tag>
                  <button type="button" className="btn" disabled={busy}
                    onClick={() => run(() => removeFinalVote(), { failText: "Não foi possível remover a escolha. Tenta novamente." })}>
                    Remover escolha
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy}
                  onClick={() => run(() => saveFinalVote(c.submissionId), { failText: "Não foi possível guardar a favorita. Tenta novamente." })}>
                  Escolher como favorita
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
