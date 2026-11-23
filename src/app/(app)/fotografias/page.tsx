import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/auth";
import { PHOTOS_BUCKET, signedUrls } from "@/lib/storage";
import { CategoryCard } from "@/components/CategoryCard";
import type { Category, ContestFlags } from "@/lib/types";

export default async function MyPhotosPage() {
  const auth = await getAuth();
  const supabase = await createClient();
  const [{ data: cats }, { data: subs }, { data: flags }] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("submissions").select("id,category_id,file_name,uploaded_on,photo_number,has_photo").eq("has_photo", true),
    supabase.rpc("contest_flags"),
  ]);
  const f = (flags as ContestFlags | null) ?? { started: false, contestStarted: false, submissionsClosed: false, startedOn: null, closedOn: null };
  const urls = await signedUrls(supabase, PHOTOS_BUCKET, (subs ?? []).map((s) => s.id));
  const canEdit = f.started && !f.submissionsClosed;

  return (
    <>
      <div className="page-head">
        <h1>As minhas fotografias</h1>
        <div className="row">
          {auth?.isAdmin && <Link href="/admin/submissoes" className="btn btn-sm">Administração</Link>}
          {f.started && <Link href="/enunciados" className="btn btn-sm btn-primary">Ver enunciados</Link>}
          <Link href="/votacao" className="btn btn-sm btn-primary">Votação</Link>
        </div>
      </div>
      <p className="intro">Carrega uma fotografia por categoria.</p>
      <div className="stack">
        {f.submissionsClosed && (
          <div className="banner">As submissões estão encerradas. Já não é possível carregar, substituir ou eliminar fotografias.</div>
        )}
        {!f.started && (
          <div className="banner">O concurso ainda não foi iniciado. Vais poder carregar as tuas fotografias assim que for iniciado.</div>
        )}
        {(cats as Category[] | null)?.length === 0 ? (
          <div className="state">Não há categorias disponíveis.</div>
        ) : (
          <div className="grid">
            {(cats as Category[]).map((c) => {
              const s = (subs ?? []).find((x) => x.category_id === c.id);
              return (
                <CategoryCard key={c.id} categoryId={c.id} label={c.label} hasPhoto={Boolean(s)} url={s ? urls[s.id] : undefined}
                  fileName={s?.file_name} uploadedOn={s?.uploaded_on} photoNumber={s?.photo_number ?? 0} canEdit={canEdit} />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
