import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VoteForm } from "@/components/AdminForms";
import type { Category } from "@/lib/types";

type Vote = { voteId: number; voterId: string; submissionId: string; categoryId: number; score: number };

export default async function VoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "novo";
  const supabase = await createClient();
  let vote: Vote | null = null;
  if (!isNew) {
    if (!/^\d+$/.test(id)) notFound();
    const { data, error } = await supabase.rpc("admin_get_vote", { p_vote_id: Number(id) });
    if (error || !data) notFound();
    vote = data as Vote;
  }
  const [{ data: cats }, { data: users }] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.rpc("list_users", { p_search: "", p_offset: 0, p_limit: 200, p_sort: "name", p_desc: false }),
  ]);
  const categories = cats as Category[];
  const catId = vote?.categoryId ?? categories[0].id;
  const { data: subs } = await supabase.rpc("admin_list_category_submissions", { p_category_id: catId });
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>{isNew ? "Novo voto" : "Editar voto"}</h1>
      <VoteForm voteId={vote?.voteId ?? null}
        voters={(((users as { rows: { user_id: string; name: string; email: string }[] } | null)?.rows ?? [])).map((u) => ({ id: u.user_id, label: u.name || u.email }))}
        categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        initial={{ voterId: vote?.voterId ?? "", categoryId: catId, submissionId: vote?.submissionId ?? "", score: vote?.score ?? 0 }}
        submissions={((subs as { submission_id: string; label: string }[]) ?? []).map((s) => ({ id: s.submission_id, label: s.label }))} />
    </div>
  );
}
