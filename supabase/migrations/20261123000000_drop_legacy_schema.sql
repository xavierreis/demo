-- Remove o schema anterior ("app-fotografias", versão de 5 de novembro) para dar lugar ao modelo da
-- Largada de Fotógrafos. Backup completo em supabase/backup/legacy-schema-2026-11-05.sql.
-- Utilizadores (auth.users) mantêm-se. O bucket antigo "photos" e o seu ficheiro NÃO são tocados.

-- Guarda quem era administrador e o nome, para recriar os perfis no modelo novo.
create table public._legacy_profiles as
  select id, display_name, is_admin from public.profiles;

drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists "storage photos: ver quando a fotografia é visível" on storage.objects;
drop policy if exists "storage photos: upload próprio com uploads abertos" on storage.objects;
drop policy if exists "storage photos: apagar próprio com uploads abertos" on storage.objects;

drop table if exists public.votes cascade;
drop table if exists public.photos cascade;
drop table if exists public.categories cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.profiles cascade;

drop function if exists public.submit_votes(smallint, jsonb);
drop function if exists public.get_results(smallint);
drop function if exists public.check_vote();
drop function if exists public.protect_admin_flag();
drop function if exists public.handle_new_user();
drop function if exists public.category_photos_visible(smallint);
drop function if exists public.category_uploads_open(smallint);
drop function if exists public.category_voting_open(smallint);
drop function if exists public.is_admin();
