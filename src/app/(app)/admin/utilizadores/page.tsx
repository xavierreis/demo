import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/auth";
import { RoleToggle } from "@/components/AdminForms";
import { Pager } from "@/components/Pager";

type U = { user_id: string; name: string; email: string; is_admin: boolean; is_participant: boolean };
const LIMIT = 10;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; desc?: string; offset?: string }> }) {
  const sp = await searchParams;
  const auth = await getAuth();
  const offset = Math.max(0, Number(sp.offset) || 0);
  const sort = sp.sort === "email" ? "email" : "name";
  const desc = sp.desc === "1";
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_users", { p_search: sp.q ?? "", p_offset: offset, p_limit: LIMIT, p_sort: sort, p_desc: desc });
  const res = (data as { total: number; rows: U[] } | null) ?? { total: 0, rows: [] };
  const sortHref = (col: string) => `/admin/utilizadores?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), sort: col, ...(sort === col && !desc ? { desc: "1" } : {}) })}`;
  return (
    <div className="stack">
      <div className="page-head"><h1>Utilizadores</h1><Link href="/admin/submissoes" className="btn btn-sm">Administração</Link></div>
      <p className="muted">As alterações de permissões aplicam-se no próximo início de sessão do utilizador.</p>
      <form className="row" method="get">
        <input type="search" name="q" placeholder="Pesquisar por nome ou e-mail" defaultValue={sp.q ?? ""} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary">Pesquisar</button>
      </form>
      {res.rows.length === 0 ? <div className="state">Sem resultados.</div> : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr>
              <th><Link href={sortHref("name")}>Nome{sort === "name" ? (desc ? " ↓" : " ↑") : ""}</Link></th>
              <th><Link href={sortHref("email")}>E-mail{sort === "email" ? (desc ? " ↓" : " ↑") : ""}</Link></th>
              <th>Administrador</th><th>Utilizador</th>
            </tr></thead>
            <tbody>
              {res.rows.map((u) => {
                const self = u.user_id === auth?.userId;
                return (
                  <tr key={u.user_id}>
                    <td>{u.name}</td><td>{u.email}</td>
                    <td>
                      <RoleToggle userId={u.user_id} role="administrator" on={u.is_admin} name={u.name || u.email} disabled={self}
                        title={self ? "Não podes retirar o teu próprio perfil." : undefined} />
                      {self && <div className="muted">Não podes retirar o teu próprio perfil.</div>}
                    </td>
                    <td><RoleToggle userId={u.user_id} role="participant" on={u.is_participant} name={u.name || u.email} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/utilizadores" params={{ q: sp.q, sort: sp.sort, desc: sp.desc }} offset={offset} limit={LIMIT} total={res.total} />
    </div>
  );
}
