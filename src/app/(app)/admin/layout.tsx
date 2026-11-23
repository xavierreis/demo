import { requireAdmin } from "@/lib/auth";

// Todos os ecrãs de administração exigem o perfil de administrador.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
