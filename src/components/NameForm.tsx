"use client";

import { useState, type FormEvent } from "react";
import { updateMyName } from "@/lib/actions";
import { useRunner } from "@/components/ui";

export function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const { run, busy } = useRunner();
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); run(() => updateMyName(name)); }}>
      <div className="field">
        <label htmlFor="n">Nome</label>
        <input id="n" type="text" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? "A guardar..." : "Guardar nome"}</button>
    </form>
  );
}
