import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { SubmissionForm } from "@/components/AdminForms";
import { ViewablePhoto } from "@/components/ui";
import { formatDateTime, formatSize } from "@/lib/utils";

type S = { submissionId: string; personName: string; personUsername: string; categoryLabel: string; fileName: string; contentType: string; fileSize: number; uploadedOn: string; photoNumber: number };

export default async function PhotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_submission", { p_submission_id: id });
  if (error || !data) notFound();
  const s = data as S;
  const urls = await signedUrls(supabase, PHOTOS_BUCKET, [id]);
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>Editar fotografia</h1>
      <div className="card">
        <b>{s.personName}</b> <span className="muted">{s.personUsername}</span>
        <div>{s.categoryLabel} · {s.contentType} · {formatSize(s.fileSize)}</div>
        <div className="muted">{formatDateTime(s.uploadedOn)}</div>
        {urls[id] && <div style={{ marginTop: 8 }}><ViewablePhoto src={urls[id]} title={s.fileName} /></div>}
      </div>
      <SubmissionForm submissionId={id} fileName={s.fileName} photoNumber={s.photoNumber} />
    </div>
  );
}
