import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { pad3 } from "@/lib/utils";
import { CategoryStateRow, DownloadButton } from "@/components/AdminClient";
import { RefreshButton, ViewablePhoto } from "@/components/ui";
import type { Category } from "@/lib/types";

type State = { category_id: number; label: string; status: string; photo_count: number; unnumbered_count: number; vote_count: number };
type Result = { submission_id: string; photo_number: number; author_name: string; author_username: string; total_points: number; votes_count: number; count1: number; count2: number; count3: number; count4: number; count5: number; rank: number };

export default async function AdminVotingPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: states }, { data: cats }] = await Promise.all([supabase.rpc("get_admin_voting_overview"), supabase.from("categories").select("*").order("sort_order")]);
  const categories = cats as Category[];
  const selected = categories.find((c) => c.id === Number(sp.cat)) ?? categories[0];

  const [{ data: resData }, { data: stats }, { data: status }] = await Promise.all([
    supabase.rpc("get_category_results", { p_category_id: selected.id }),
    supabase.rpc("get_category_voting_stats", { p_category_id: selected.id }),
    supabase.rpc("category_status", { p_category_id: selected.id }),
  ]);
  const results = (resData as Result[]) ?? [];
  const podium = results.filter((r) => r.rank <= 3 && r.votes_count > 0);
  const urls = await signedUrls(supabase, PHOTOS_BUCKET, podium.map((r) => r.submission_id));
  const tie = (rank: number) => podium.filter((r) => r.rank === rank).length;
  const st = (stats as { votersCount: number; completeVotersCount: number } | null) ?? { votersCount: 0, completeVotersCount: 0 };

  return (
    <div className="stack">
      <div className="page-head"><h1>Votações</h1><Link href="/admin/submissoes" className="btn btn-sm">Administração</Link></div>
      <section className="stack">
        <h2>Estado da votação por categoria</h2>
        <p className="muted">Para abrir uma votação, encerra as submissões e numera as fotografias no ecrã de <Link href="/admin/submissoes">Administração</Link>.</p>
        {((states as State[]) ?? []).map((s) => (
          <CategoryStateRow key={s.category_id} categoryId={s.category_id} label={s.label} status={s.status}
            photoCount={s.photo_count} unnumbered={s.unnumbered_count} votes={s.vote_count} />
        ))}
      </section>
      <section className="stack">
        <h2>Resultados</h2>
        <div className="tabs">
          {categories.map((c) => <Link key={c.id} href={`/admin/votacoes?cat=${c.id}`} className={c.id === selected.id ? "tab on" : "tab"}>{c.label}</Link>)}
        </div>
        <div className="row-between">
          <div className="row">
            {status === "a_decorrer" && <span className="pill pill-prov">Provisório</span>}
            {status === "encerrado" && <span className="pill pill-final">Final</span>}
            {status === "por_iniciar" && <span className="pill pill-idle">Votação por iniciar</span>}
            {status !== "por_iniciar" && (
              <span className="muted">{st.votersCount} {st.votersCount === 1 ? "votante" : "votantes"} ({st.completeVotersCount} com as 5 pontuações atribuídas)</span>
            )}
          </div>
          <RefreshButton className="btn btn-sm" />
        </div>
        {status === "por_iniciar" ? <div className="state">Ainda não há resultados.</div> : (
          <>
            <h2>Pódio</h2>
            {podium.length === 0 ? <div className="state">Sem votos</div> : (
              <div className="podium">
                {podium.map((r) => (
                  <div className="card" key={r.submission_id}>
                    <b>{r.rank}.º lugar{tie(r.rank) > 1 ? " ex aequo" : ""}</b>
                    {urls[r.submission_id] && <ViewablePhoto src={urls[r.submission_id]} title={`Fotografia Nº ${pad3(r.photo_number)}`} />}
                    <div className="card-title">Fotografia Nº {pad3(r.photo_number)}</div>
                    <div>{r.author_name} ({r.author_username})</div>
                    <div><b>{r.total_points} pontos</b> · {r.votes_count} {r.votes_count === 1 ? "voto" : "votos"}</div>
                    <div className="muted">5×{r.count5} · 4×{r.count4} · 3×{r.count3} · 2×{r.count2} · 1×{r.count1}</div>
                    <div style={{ marginTop: 8 }}><DownloadButton submissionId={r.submission_id} /></div>
                  </div>
                ))}
              </div>
            )}
            <h2>Classificação completa</h2>
            {results.length === 0 ? <div className="state">Ainda não há fotografias nesta categoria.</div> : (
              <div className="table-wrap card">
                <table className="table">
                  <thead><tr><th>Posição</th><th>Nº</th><th>Autor</th><th className="num">Pontos</th><th className="num">Votos</th><th className="num">5</th><th className="num">4</th><th className="num">3</th><th className="num">2</th><th className="num">1</th></tr></thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.submission_id} className={r.rank <= 3 && r.votes_count > 0 ? "top" : ""}>
                        <td>{r.rank}.º</td><td>{r.photo_number === 0 ? "—" : pad3(r.photo_number)}</td><td>{r.author_name}</td>
                        <td className="num">{r.total_points}</td><td className="num">{r.votes_count}</td>
                        <td className="num">{r.count5}</td><td className="num">{r.count4}</td><td className="num">{r.count3}</td><td className="num">{r.count2}</td><td className="num">{r.count1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
