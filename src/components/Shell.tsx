import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/auth";
import { NavClient } from "@/components/NavClient";
import type { ContestFlags } from "@/lib/types";

// Cabeçalho com o menu (Submeter · Votação · Prémio Final · Regulamento · [Enunciados] · secção ADMIN).
export async function Shell({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  let started = false;
  if (auth) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("contest_flags");
    started = Boolean((data as ContestFlags | null)?.started);
  }
  const items: { href: string; label: string; section?: string }[] = [];
  if (auth?.isParticipant) {
    items.push(
      { href: "/fotografias", label: "Submeter Fotografias" },
      { href: "/votacao", label: "Votação" },
      { href: "/premio-final", label: "Prémio Final" },
    );
  }
  items.push({ href: "/regulamento", label: "Regulamento" });
  if (auth?.isParticipant && started) items.push({ href: "/enunciados", label: "Enunciados" });
  if (auth?.isAdmin) {
    items.push(
      { href: "/admin/submissoes", label: "Dashboard Submissões", section: "ADMIN" },
      { href: "/admin/votacoes", label: "Dashboard Votações", section: "ADMIN" },
      { href: "/admin/votos", label: "Lista Votos", section: "ADMIN" },
      { href: "/admin/utilizadores", label: "Lista Utilizadores", section: "ADMIN" },
      { href: "/admin/fotografias", label: "Lista Fotografias", section: "ADMIN" },
      { href: "/admin/premio-final", label: "Prémio Final", section: "ADMIN" },
      { href: "/admin/enunciados", label: "Enunciados", section: "ADMIN" },
    );
  }
  return (
    <>
      <header className="header">
        <div className="header-in">
          <Link href={auth ? "/fotografias" : "/login"} className="brand">📷 Largada de Fotógrafos</Link>
          <NavClient items={items} userName={auth ? auth.name : null} />
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
