import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATEMENTS_BUCKET, signedUrls } from "@/lib/storage";
import { StatementEditor } from "@/components/AdminForms";
import type { StatementItem } from "@/lib/types";

export default async function AdminStatementsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_get_statements");
  const items = (data as StatementItem[]) ?? [];
  const urls = await signedUrls(supabase, STATEMENTS_BUCKET, items.filter((i) => i.hasImage).map((i) => String(i.categoryId)));
  return (
    <div className="stack">
      <div className="page-head"><h1>Enunciados</h1><Link href="/admin/submissoes" className="btn btn-sm">Administração</Link></div>
      <p className="intro">Os participantes só veem estes enunciados depois de o concurso ser iniciado.</p>
      {items.map((i) => (
        <StatementEditor key={i.categoryId} categoryId={i.categoryId} label={i.categoryLabel} title={i.title} subtitle={i.subtitle}
          body={i.body} credits={i.credits} hasImage={i.hasImage} imageUrl={urls[String(i.categoryId)]} />
      ))}
    </div>
  );
}
