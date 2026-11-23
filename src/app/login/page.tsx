import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const auth = await getAuth();
  if (auth?.isParticipant) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/fotografias");
  return (
    <div className="auth">
      <h1>📷 Largada de Fotógrafos</h1>
      <p className="intro" style={{ textAlign: "center" }}>Azenhas da Serra – Bread and Spa</p>
      <LoginForm next={next} />
    </div>
  );
}
