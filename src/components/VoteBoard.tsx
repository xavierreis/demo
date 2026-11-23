"use client";

import { removeVote, saveVote } from "@/lib/actions";
import { photoLabel } from "@/lib/utils";
import { Tag, useRunner, ViewablePhoto } from "@/components/ui";

export type VotePhoto = { submissionId: string; photoNumber: number; myScore: number; url?: string };

const SCORES = [5, 4, 3, 2, 1];
const scoreText = (s: number) => `${s} ${s === 1 ? "ponto" : "pontos"}`;

export function VoteBoard({ photos, slots }: { photos: VotePhoto[]; slots: Record<number, string> }) {
  const { run, busy } = useRunner();

  // Tocar na pontuação atual remove-a; atribuir uma pontuação já usada move-a (mensagem do servidor).
  const click = (p: VotePhoto, score: number) =>
    run(() => (p.myScore === score ? removeVote(p.submissionId) : saveVote(p.submissionId, score, p.photoNumber)), {
      failText: "Não foi possível guardar a pontuação. Tenta novamente.",
    });

  return (
    <div className="stack">
      <p className="intro">
        Atribui pontos às fotografias: 5 pontos à que mais gostas, 4 pontos à seguinte, e assim até 1 ponto. Cada
        pontuação só pode ser usada uma vez nesta categoria e cada fotografia só pode ter uma pontuação.
      </p>
      <div className="strip">
        {SCORES.map((s) => (
          <div className="slot" key={s}>
            <span className="num">{s}</span>
            <span className="unit">{s === 1 ? "ponto" : "pontos"}</span>
            <div className="which">{slots[s] ?? "—"}</div>
          </div>
        ))}
      </div>
      {photos.length === 0 ? (
        <div className="state">Ainda não há fotografias nesta categoria.</div>
      ) : (
        <div className="grid">
          {photos.map((p) => (
            <div className="card" key={p.submissionId}>
              {p.url && <ViewablePhoto src={p.url} title={p.photoNumber ? `Fotografia ${photoLabel(p.photoNumber)}` : "Fotografia"} />}
              <div className="row-between" style={{ marginTop: 8 }}>
                <span className="card-title">{p.photoNumber === 0 ? "Sem número" : `Fotografia ${photoLabel(p.photoNumber)}`}</span>
                {p.myScore > 0 && <Tag kind="primary">{scoreText(p.myScore)}</Tag>}
              </div>
              <div className="score-btns">
                {SCORES.map((s) => (
                  <button key={s} type="button" disabled={busy} aria-label={scoreText(s)} onClick={() => click(p, s)}
                    className={p.myScore === s ? "btn btn-primary" : "btn"}>
                    <b>{s}</b><small>{s === 1 ? "ponto" : "pontos"}</small>
                  </button>
                ))}
              </div>
              {p.myScore > 0 && (
                <button type="button" className="linklike" disabled={busy}
                  onClick={() => run(() => removeVote(p.submissionId), { failText: "Não foi possível remover a pontuação. Tenta novamente." })}>
                  Remover pontuação
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
