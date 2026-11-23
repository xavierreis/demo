import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatSize, pad3, plural } from "@/lib/utils";
import { ContestControls, DownloadButton } from "@/components/AdminClient";
import { Tag } from "@/components/ui";
import type { Category, ContestFlags } from "@/lib/types";

type Row = { submission_id: string; person_name: string; person_username: string; category_label: string; photo_number: number; file_name: string; file_size: number; uploaded_on: string };

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; categoria?: string; numero?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: flags }, { data: cats }, { data: people }, { data: list }] = await Promise.all([
    supabase.rpc("contest_flags"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.rpc("admin_submission_people"),
    supabase.rpc("admin_list_submissions", {
      p_user_id: sp.pessoa || null, p_category_id: sp.categoria ? Number(sp.categoria) : null,
      p_number: sp.numero ? Number(sp.numero) : 0, p_limit: 200,
    }),
  ]);
  const f = (flags as ContestFlags | null) ?? { started: false, contestStarted: false, submissionsClosed: false, startedOn: null, closedOn: null };
  const rows = (list as { rows: Row[] } | null)?.rows ?? [];
  return (
    <div className="stack">
      <div className="page-head"><h1>Administração</h1><Link href="/fotografias" className="btn btn-sm">As minhas fotografias</Link></div>
      <ContestControls started={f.contestStarted} closed={f.submissionsClosed} startedOn={f.startedOn} closedOn={f.closedOn} />
      <form className="card" method="get">
        <div className="filters">
          <div className="field"><label htmlFor="pessoa">Pessoa</label>
            <select id="pessoa" name="pessoa" defaultValue={sp.pessoa ?? ""}>
              <option value="">Todas as pessoas</option>
              {((people as { person_id: string; person_label: string }[]) ?? []).map((p) => <option key={p.person_id} value={p.person_id}>{p.person_label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" defaultValue={sp.categoria ?? ""}>
              <option value="">Todas as categorias</option>
              {(cats as Category[]).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="numero">Número</label>
            <input id="numero" name="numero" type="number" min={0} defaultValue={sp.numero ?? ""} /></div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary">Filtrar</button>
            <Link href="/admin/submissoes" className="btn">Limpar filtros</Link>
          </div>
        </div>
        <div className="muted">{plural(rows.length, "submissão", "submissões")}</div>
      </form>
      {rows.length === 0 ? <div className="state">Sem submissões para os filtros escolhidos.</div> : (
        <div className="stack">
          {rows.map((r) => (
            <div className="list-item" key={r.submission_id}>
              <div>
                <b>{r.person_name}</b> <span className="muted">{r.person_username}</span>{" "}
                {r.photo_number > 0 ? <Tag kind="primary">Nº {pad3(r.photo_number)}</Tag> : <Tag kind="neutral">Sem número</Tag>}
                <div>{r.category_label} · {r.file_name}</div>
                <div className="muted">{formatSize(r.file_size)} · {formatDateTime(r.uploaded_on)}</div>
              </div>
              <DownloadButton submissionId={r.submission_id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
