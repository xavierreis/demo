import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { photoLabel } from "@/lib/utils";
import { Tag, ViewablePhoto } from "@/components/ui";
import { VoteBoard } from "@/components/VoteBoard";

type Row = { submission_id: string; photo_number: number; my_score: number };

export default async function VoteCategoryPage({ params }: { params: Promise<{ categoria: string }> }) {
  const id = Number((await params).categoria);
  const supabase = await createClient();
  const { data: cat } = Number.isInteger(id)
    ? await supabase.from("categories").select("id,label").eq("id", id).maybeSingle()
    : { data: null };

  const back = <Link href="/votacao" className="btn btn-sm">Votação</Link>;
  if (!cat) {
    return (<><div className="page-head"><h1>Votação</h1>{back}</div><div className="state">Esta categoria não existe.</div></>);
  }
  const { data: status } = await supabase.rpc("category_status", { p_category_id: id });

  let body: React.ReactNode;
  if (status === "a_decorrer") {
    const [{ data: photos }, { data: summary }] = await Promise.all([
      supabase.rpc("get_category_photos", { p_category_id: id }),
      supabase.rpc("get_score_summary", { p_category_id: id }),
    ]);
    const rows = (photos as Row[]) ?? [];
    const urls = await signedUrls(supabase, PHOTOS_BUCKET, rows.map((r) => r.submission_id));
    const slots: Record<number, string> = {};
    for (const s of (summary as { score: number; label: string }[]) ?? []) slots[s.score] = s.label;
    body = (
      <VoteBoard slots={slots}
        photos={rows.map((r) => ({ submissionId: r.submission_id, photoNumber: r.photo_number, myScore: r.my_score, url: urls[r.submission_id] }))} />
    );
  } else if (status === "encerrado") {
    const { data: mine } = await supabase.rpc("get_my_voted_photos", { p_category_id: id });
    const rows = (mine as Row[]) ?? [];
    const urls = await signedUrls(supabase, PHOTOS_BUCKET, rows.map((r) => r.submission_id));
    body = (
      <div className="stack">
        <div><Tag kind="red">Votação encerrada</Tag></div>
        <p className="intro">Estes são os teus votos nesta categoria. Já não é possível alterá-los.</p>
        {rows.length === 0 ? <div className="state">Não votaste nesta categoria.</div> : (
          <div className="grid">
            {rows.map((r) => (
              <div className="card" key={r.submission_id}>
                {urls[r.submission_id] && <ViewablePhoto src={urls[r.submission_id]} title={`Fotografia ${photoLabel(r.photo_number)}`} />}
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="card-title">Fotografia {photoLabel(r.photo_number)}</span>
                  <Tag kind="primary">{r.my_score} {r.my_score === 1 ? "ponto" : "pontos"}</Tag>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/votacao" className="linklike">Voltar à votação</Link>
      </div>
    );
  } else {
    body = (
      <div className="card">
        <p className="intro">A votação desta categoria ainda não começou.</p>
        <Link href="/votacao" className="linklike">Voltar à votação</Link>
      </div>
    );
  }
  return (<><div className="page-head"><h1>{cat.label}</h1>{back}</div>{body}</>);
}
