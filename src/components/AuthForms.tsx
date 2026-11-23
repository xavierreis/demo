"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/fotografias");

function mapError(message: string, code?: string) {
  if (code === "weak_password" || /password/i.test(message) && /(least|weak|short|characters)/i.test(message))
    return "Palavra-passe demasiado simples. Usa pelo menos 8 caracteres.";
  if (/already registered|already been registered|user_already_exists/i.test(message + (code ?? "")))
    return "Já existe uma conta com este e-mail.";
  if (/invalid login|invalid_credentials/i.test(message + (code ?? ""))) return "E-mail ou palavra-passe incorretos.";
  if (/email not confirmed|email_not_confirmed/i.test(message + (code ?? ""))) return "Confirma primeiro o teu e-mail (vê a caixa de correio).";
  if (/rate limit|over_email_send_rate_limit/i.test(message + (code ?? ""))) return "Foram pedidos demasiados e-mails. Tenta novamente daqui a pouco.";
  if (/invalid email|email_address_invalid/i.test(message + (code ?? ""))) return "Indica um e-mail válido.";
  return "Algo correu mal. Tenta novamente.";
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err || !data.user) {
      setError(err ? mapError(err.message, err.code) : "Algo correu mal. Tenta novamente.");
      setBusy(false);
      return;
    }
    // O início de sessão exige o perfil de participante.
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "participant")) {
      await supabase.auth.signOut();
      setError("Sem permissões.");
      setBusy(false);
      return;
    }
    router.replace(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Palavra-passe</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "A entrar..." : "Iniciar sessão"}</button>
      <p className="muted" style={{ textAlign: "center" }}>
        <Link href="/recuperar-palavra-passe">Esqueci-me da palavra-passe</Link>
      </p>
      <div className="muted" style={{ textAlign: "center", margin: "8px 0" }}>ou</div>
      <Link href="/registar" className="btn btn-block">Registar</Link>
      <p style={{ textAlign: "center" }}><Link href="/regulamento">Ler o regulamento</Link></p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Indica o teu nome.");
    if (password.length < 8) return setError("Palavra-passe demasiado simples. Usa pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As palavras-passe não coincidem.");
    setBusy(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/fotografias` },
    });
    setBusy(false);
    if (err) return setError(mapError(err.message, err.code));
    if (data.session) {
      router.replace("/fotografias");
      router.refresh();
    } else {
      setSent(true);
    }
  }

  if (sent)
    return (
      <div className="card">
        <p><b>Registo criado.</b> Enviámos-te um e-mail para <b>{email}</b>. Abre a ligação que lá está para confirmares a conta e entrares.</p>
        <Link href="/login" className="btn btn-block">Voltar ao início de sessão</Link>
      </div>
    );

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label htmlFor="name">Nome</label>
        <input id="name" type="text" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Definir palavra-passe</label>
        <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirmar palavra-passe</label>
        <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? "A registar..." : "Registar"}</button>
        <Link href="/login" className="btn">Cancelar</Link>
      </div>
      <p><Link href="/regulamento">Ler o regulamento</Link></p>
    </form>
  );
}

export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/repor-palavra-passe`,
    });
    setBusy(false);
    if (err) return setError(mapError(err.message, err.code));
    setSent(true);
  }

  if (sent)
    return (
      <div className="card">
        <p>Se existir uma conta com esse e-mail, enviámos uma ligação para definires uma nova palavra-passe.</p>
        <Link href="/login" className="btn btn-block">Voltar</Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? "A enviar..." : "Enviar ligação"}</button>
        <Link href="/login" className="btn">Cancelar</Link>
      </div>
    </form>
  );
}

// Usado para repor (depois de abrir a ligação do e-mail) e para alterar a palavra-passe no perfil.
export function PasswordForm({ redirectTo, submitLabel }: { redirectTo?: string; submitLabel: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (password.length < 8) return setError("Palavra-passe demasiado simples. Usa pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As palavras-passe não coincidem.");
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(mapError(err.message, err.code));
    setPassword("");
    setConfirm("");
    setDone(true);
    if (redirectTo) {
      router.replace(redirectTo);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="np">Nova palavra-passe</label>
        <input id="np" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cp">Confirmar palavra-passe</label>
        <input id="cp" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="muted">Palavra-passe atualizada.</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "A guardar..." : submitLabel}</button>
    </form>
  );
}
