import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ligações dos e-mails (confirmar registo / repor palavra-passe): troca o código por sessão.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next") ?? "/fotografias";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/fotografias";
  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "signup" | "recovery" | "email" })).error;
  }
  return NextResponse.redirect(`${origin}${ok ? next : "/login"}`);
}
