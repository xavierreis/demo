"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/actions";

type Item = { href: string; label: string; section?: string };

export function NavClient({ items, userName }: { items: Item[]; userName: string | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const main = items.filter((i) => !i.section);
  const admin = items.filter((i) => i.section);
  const link = (i: Item) => (
    <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? "active" : ""} onClick={() => setOpen(false)}>
      {i.label}
    </Link>
  );
  return (
    <>
      <button type="button" className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ☰
      </button>
      <div style={{ flexBasis: "100%", height: 0 }} />
      <nav className={open ? "nav open" : "nav"} aria-label="Navegação principal">
        {main.map(link)}
        {admin.length > 0 && <div className="section">ADMIN</div>}
        {admin.map(link)}
        {userName ? (
          <>
            <div className="who">
              <Link href="/perfil" onClick={() => setOpen(false)}>{userName}</Link>
            </div>
            <form action={signOut}><button type="submit" className="linkish">Terminar sessão</button></form>
          </>
        ) : (
          <Link href="/login">Iniciar sessão</Link>
        )}
      </nav>
    </>
  );
}
