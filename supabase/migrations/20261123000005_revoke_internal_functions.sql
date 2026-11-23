-- Funções internas que não devem ser chamáveis por clientes (o Supabase concede EXECUTE por omissão).
revoke execute on function public.reset_voting_state() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
