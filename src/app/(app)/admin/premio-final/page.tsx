import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { pad3 } from "@/lib/utils";
import { CandidateToggle, FinalStatusPanel, RemoveCandidateButton } from "@/components/AdminClient";
import { RefreshButton, ViewablePhoto } from "@/components/ui";
import type { Category } from "@/lib/types";

type Card = { submission_id: string; category_label: string; photo_number: number; author_name: string; author_username: string; category_rank: number; category_points: number };
type FinalRow = { submission_id: string; category_label: string; photo_number: number; author_name: string; author_username: string; votes_count: number; rank: number };
type Manual = { categoryStatus: string; rows: { submissionId: string; photoNumber: number; authorName: string; totalPoints: number; rank: number; isCandidate: boolean }[] };

export default async function AdminFinalPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: status }, { data: cards }, { data: cats }, { data: finalRes }] = await Promise.all([
    supabase.rpc("get_final_status"),
    supabase.rpc("get_final_admin_cards"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.rpc("get_final_results"),
  ]);
  const categories = cats as Category[];
  const selected = categories.find((c) => c.id === Number(sp.cat)) ?? categories[0];
  const { data: manualData } = await supabase.rpc("get_final_manual_rows", { p_category_id: selected.id });
  const manual = (manualData as Manual | null) ?? { categoryStatus: "por_iniciar", rows: [] };
  const st = (status as string) ?? "por_iniciar";
  const candidates = (cards as Card[]) ?? [];
  const fr = (finalRes as { totalVoters: number; rows: FinalRow[] } | null) ?? { totalVoters: 0, rows: [] };
  const locked = st !== "por_iniciar";
  const urls = await signedUrls(supabase, PHOTOS_BUCKET, [...candidates.map((c) => c.submission_id)]);

  const tie = fr.rows.filter((r) => r.rank === 1 && r.votes_count > 0).length;

  return (
    <div className="stack">
      <div className="page-head"><h1>Prémio final</h1><Link href="/admin/votacoes" className="btn btn-sm">Votações</Link></div>
      <section className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Estado da votação final</div>
        <FinalStatusPanel status={st} candidateCount={candidates.length} totalVoters={fr.totalVoters} />
      </section>
      <section className="card stack">
        <div className="card-title">Candidatas</div>
        {candidates.length === 0 ? <div className="state">Ainda não há fotografias candidatas.</div> : (
          <div className="grid">
            {candidates.map((c) => (
              <div className="card" key={c.submission_id}>
                {urls[c.submission_id] && <ViewablePhoto src={urls[c.submission_id]} title={`${c.category_label} · Nº ${pad3(c.photo_number)}`} />}
                <div className="card-title">{c.category_label}</div>
                <div><b>Nº {pad3(c.photo_number)}</b></div>
                <div className="muted">{c.author_name} ({c.author_username})</div>
                <div className="muted">{c.category_rank}.º na categoria · {c.category_points} pontos</div>
                <RemoveCandidateButton submissionId={c.submission_id} locked={locked} />
              </div>
            ))}
          </div>
        )}
        {locked && <div className="muted">A votação final já começou; não é possível alterar os candidatos.</div>}
      </section>
      <section className="card stack">
        <div className="card-title">Escolher manualmente</div>
        <div className="tabs">
          {categories.map((c) => <Link key={c.id} href={`/admin/premio-final?cat=${c.id}`} className={c.id === selected.id ? "tab on" : "tab"}>{c.label}</Link>)}
        </div>
        {manual.categoryStatus !== "encerrado" ? (
          <div className="state">A votação desta categoria ainda não foi encerrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Posição</th><th>Nº</th><th>Autor</th><th className="num">Pontos</th><th /></tr></thead>
              <tbody>
                {manual.rows.map((r) => (
                  <tr key={r.submissionId} className={r.isCandidate ? "top" : ""}>
                    <td>{r.rank}.º</td><td>{r.photoNumber === 0 ? "—" : pad3(r.photoNumber)}</td><td>{r.authorName}</td>
                    <td className="num">{r.totalPoints}</td>
                    <td className="num"><CandidateToggle submissionId={r.submissionId} isCandidate={r.isCandidate} locked={locked} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {(st === "a_decorrer" || st === "encerrado") && (
        <section className="card stack">
          <div className="card-title">Resultados</div>
          <div className="row-between">
            <div className="row">
              <span className={st === "a_decorrer" ? "pill pill-prov" : "pill pill-final"}>{st === "a_decorrer" ? "Provisório" : "Final"}</span>
              <span className="muted">{fr.totalVoters} {fr.totalVoters === 1 ? "votante" : "votantes"}</span>
            </div>
            <RefreshButton className="btn btn-sm" />
          </div>
          <div className="grid">
            {fr.rows.map((r) => {
              const pct = fr.totalVoters > 0 ? Math.round((r.votes_count * 100) / fr.totalVoters) : 0;
              const winner = r.rank === 1 && r.votes_count > 0;
              return (
                <div key={r.submission_id} className={winner ? "card winner" : "card"}>
                  <b>{winner ? (tie > 1 ? "Vencedora ex aequo" : "Vencedora") : `${r.rank}.º lugar`}</b>
                  {urls[r.submission_id] && <ViewablePhoto src={urls[r.submission_id]} title={`${r.category_label} · Nº ${pad3(r.photo_number)}`} />}
                  <div className="card-title">{r.category_label} · Nº {pad3(r.photo_number)}</div>
                  <div className="muted">{r.author_name} ({r.author_username})</div>
                  <div><b>{r.votes_count} {r.votes_count === 1 ? "voto" : "votos"} · {pct}%</b></div>
                  <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
