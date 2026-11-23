import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Auth = {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isParticipant: boolean;
};

export const getAuth = cache(async (): Promise<Auth | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("name,email").eq("user_id", user.id).maybeSingle(),
  ]);
  const list = (roles ?? []).map((r) => r.role as string);
  return {
    userId: user.id,
    email: profile?.email || user.email || "",
    name: profile?.name || user.email || "",
    isAdmin: list.includes("administrator"),
    isParticipant: list.includes("participant"),
  };
});

// Ecrãs de participante: exigem sessão e o perfil de participante.
export async function requireParticipant(): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.isParticipant) redirect("/sem-permissoes");
  return auth;
}

// Ecrãs de administração: exigem o perfil de administrador (e de participante, como no original).
export async function requireAdmin(): Promise<Auth> {
  const auth = await requireParticipant();
  if (!auth.isAdmin) redirect("/sem-permissoes");
  return auth;
}
