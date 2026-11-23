import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { photoLabel } from "@/lib/utils";
import { Tag, ViewablePhoto } from "@/components/ui";
import { FinalBoard } from "@/components/FinalBoard";

type Row = { submission_id: string; category_label: string; photo_number: number; is_my_choice: boolean };

export default async function FinalPrizePage() {
  const supabase = await createClient();
  const { data: status } = await supabase.rpc("get_final_status");
  const st = (status as string) ?? "por_iniciar";
  const back = <Link href="/votacao" className="btn btn-sm">Votação</Link>;

  let body: React.ReactNode;
  if (st === "por_iniciar") {
    body = <div className="card"><p className="intro">A votação do Prémio final ainda não começou.</p></div>;
  } else {
    const { data } = await supabase.rpc("get_final_candidates");
    const rows = (data as Row[]) ?? [];
    const urls = await signedUrls(supabase, PHOTOS_BUCKET, rows.map((r) => r.submission_id));
    if (st === "encerrado") {
      const mine = rows.find((r) => r.is_my_choice);
      body = (
        <div className="stack">
          <div><Tag kind="red">Votação encerrada</Tag></div>
          <p className="intro">A votação do Prémio final terminou.</p>
          {mine ? (
            <div className="card">
              {urls[mine.submission_id] && <ViewablePhoto src={urls[mine.submission_id]} title={`${mine.category_label} · ${photoLabel(mine.photo_number)}`} />}
              <div className="row-between" style={{ marginTop: 8 }}>
                <span className="card-title">{mine.category_label} · {photoLabel(mine.photo_number)}</span>
                <Tag kind="primary">A tua escolha</Tag>
              </div>
            </div>
          ) : <div className="state">Não votaste no Prémio final.</div>}
          <Link href="/votacao" className="linklike">Voltar à votação</Link>
        </div>
      );
    } else {
      body = (
        <FinalBoard candidates={rows.map((r) => ({ submissionId: r.submission_id, categoryLabel: r.category_label,
          photoNumber: r.photo_number, isMyChoice: r.is_my_choice, url: urls[r.submission_id] }))} />
      );
    }
  }
  return (<><div className="page-head"><h1>Prémio final</h1>{back}</div>{body}</>);
}
