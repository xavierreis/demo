import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATEMENTS_BUCKET, signedUrls } from "@/lib/storage";
import { StatementTabs } from "@/components/StatementTabs";
import type { StatementItem } from "@/lib/types";

export default async function StatementsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_statements");
  const res = (data as { available: boolean; items: StatementItem[] } | null) ?? { available: false, items: [] };
  const urls = res.available
    ? await signedUrls(supabase, STATEMENTS_BUCKET, res.items.filter((i) => i.hasImage).map((i) => String(i.categoryId)))
    : {};
  const images: Record<number, string> = {};
  for (const i of res.items) if (urls[String(i.categoryId)]) images[i.categoryId] = urls[String(i.categoryId)];
  return (
    <>
      <div className="page-head">
        <h1>Enunciados</h1>
        <Link href="/fotografias" className="btn btn-sm">As minhas fotografias</Link>
      </div>
      {res.available ? <StatementTabs items={res.items} images={images} /> : (
        <div className="card lock">🔒 Os enunciados só ficam disponíveis quando o concurso for iniciado.</div>
      )}
    </>
  );
}
