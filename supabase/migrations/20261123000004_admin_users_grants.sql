-- Largada de Fotógrafos — lógica de negócio (parte 3): ferramentas de administração, utilizadores e permissões.

-- ------------------------------------------------------ descarregar fotografia (admin)
-- Nome do ficheiro: Categoria_NNN.ext (sem autor). O ficheiro vem do storage por URL assinado.
create function public.admin_get_submission_download(p_submission_id uuid)
returns table (download_name text, content_type text)
language plpgsql stable security definer set search_path = '' as $$
declare s public.submissions; v_label text; v_ext text; v_tail text; v_base text;
begin
  perform public.require_admin();
  select * into s from public.submissions where id = p_submission_id and has_photo;
  if not found then raise exception 'Fotografia não encontrada.'; end if;
  select label into v_label from public.categories where id = s.category_id;
  v_tail := substring(coalesce(s.file_name, '') from '[^.]*$');
  if position('.' in coalesce(s.file_name, '')) > 0 and char_length(v_tail) between 1 and 5 then
    v_ext := lower(v_tail);
  else
    v_ext := case lower(coalesce(s.content_type, ''))
               when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
               when 'image/webp' then 'webp' when 'image/gif' then 'gif' else 'jpg' end;
  end if;
  if s.photo_number = 0 then
    v_base := v_label || '_SemNumero_' || coalesce(s.file_name, '');
  else
    v_base := v_label || '_' || public.pad3(s.photo_number) || '.' || v_ext;
  end if;
  v_base := replace(v_base, ' ', '_');
  v_base := regexp_replace(v_base, '[/\\:*?"<>|]', '', 'g');
  return query select v_base, coalesce(s.content_type, 'application/octet-stream');
end $$;

-- ---------------------------------------------------- reposições (transacionais)
-- Devolvem os ids das submissões apagadas para a aplicação limpar o storage.
create function public.reset_voting_state() returns void
language sql security definer set search_path = '' as $$
  update public.category_voting set status = 'por_iniciar', changed_on = now(), changed_by = auth.uid() where true;
  update public.final_voting_settings set status = 'por_iniciar', changed_on = now(), changed_by = auth.uid() where id = 1;
$$;

create function public.reset_contest() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  perform public.require_admin();
  select coalesce(array_agg(id), '{}') into v_ids from public.submissions;
  delete from public.final_votes where true;
  delete from public.final_candidates where true;
  delete from public.votes where true;
  delete from public.submissions where true;
  perform public.reset_voting_state();
  update public.contest_settings
     set contest_started = false, submissions_closed = false,
         started_on = null, started_by = null, closed_on = null, closed_by = null
   where id = 1;
  return v_ids;
end $$;

create function public.delete_all_photos() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  perform public.require_admin();
  select coalesce(array_agg(id), '{}') into v_ids from public.submissions;
  delete from public.final_votes where true;
  delete from public.final_candidates where true;
  delete from public.votes where true;
  delete from public.submissions where true;
  perform public.reset_voting_state();
  return v_ids;
end $$;

create function public.delete_all_votes() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.final_votes where true;
  delete from public.final_candidates where true;
  delete from public.votes where true;
  perform public.reset_voting_state();
end $$;

-- ------------------------------------------------------------- utilizadores e perfis
create function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_has boolean; v_admins integer;
begin
  perform public.require_admin();
  if p_role not in ('administrator', 'participant') then
    raise exception 'Perfil inválido.';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Utilizador não encontrado.';
  end if;
  select exists (select 1 from public.user_roles where user_id = p_user_id and role = p_role) into v_has;
  if v_has = p_grant then return; end if;
  if p_grant then
    insert into public.user_roles (user_id, role) values (p_user_id, p_role) on conflict do nothing;
    return;
  end if;
  if p_role = 'administrator' then
    if p_user_id = auth.uid() then
      raise exception 'Não podes retirar o teu próprio perfil de administrador.';
    end if;
    select count(*) into v_admins from public.user_roles where role = 'administrator';
    if v_admins <= 1 then
      raise exception 'Tem de existir pelo menos um administrador.';
    end if;
  end if;
  delete from public.user_roles where user_id = p_user_id and role = p_role;
end $$;

create function public.list_users(p_search text default '', p_offset integer default 0,
                                  p_limit integer default 10, p_sort text default 'name',
                                  p_desc boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb; v_search text := '%' || coalesce(p_search, '') || '%';
begin
  perform public.require_admin();
  select count(*) into v_total from public.profiles p
   where coalesce(p_search, '') = '' or p.name ilike v_search or p.email ilike v_search;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rn), '[]'::jsonb) into v_rows from (
    select row_number() over (order by
             case when p_sort = 'email' and not p_desc then p.email end asc,
             case when p_sort = 'email' and p_desc then p.email end desc,
             case when p_sort <> 'email' and not p_desc then p.name end asc,
             case when p_sort <> 'email' and p_desc then p.name end desc,
             p.user_id) as rn,
           p.user_id, p.name, p.email,
           exists (select 1 from public.user_roles r where r.user_id = p.user_id and r.role = 'administrator') as is_admin,
           exists (select 1 from public.user_roles r where r.user_id = p.user_id and r.role = 'participant') as is_participant
      from public.profiles p
     where coalesce(p_search, '') = '' or p.name ilike v_search or p.email ilike v_search
     order by rn
     offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create function public.update_my_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if char_length(coalesce(trim(p_name), '')) = 0 then
    raise exception 'Indica o teu nome.';
  end if;
  if char_length(p_name) > 100 then
    raise exception 'O nome é demasiado comprido.';
  end if;
  update public.profiles set name = trim(p_name) where user_id = auth.uid();
end $$;

-- ----------------------------------------------------- listas de administração
create function public.admin_submission_people()
returns table (person_id uuid, person_label text)
language sql stable security definer set search_path = '' as $$
  select distinct p.user_id, coalesce(nullif(p.name, ''), p.email)
    from public.submissions s join public.profiles p on p.user_id = s.user_id
   where s.has_photo and public.is_admin()
   order by 2
$$;

create function public.admin_list_submissions(p_user_id uuid default null, p_category_id integer default null,
                                              p_number integer default 0, p_search text default '',
                                              p_offset integer default 0, p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb; v_search text := '%' || coalesce(p_search, '') || '%';
begin
  perform public.require_admin();
  select count(*) into v_total
    from public.submissions s
   where s.has_photo
     and (p_user_id is null or s.user_id = p_user_id)
     and (p_category_id is null or s.category_id = p_category_id)
     and (coalesce(p_number, 0) = 0 or s.photo_number = p_number)
     and (coalesce(p_search, '') = '' or s.file_name ilike v_search);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rn), '[]'::jsonb) into v_rows from (
    select row_number() over (order by c.sort_order, s.photo_number, p.name, s.id) as rn,
           s.id as submission_id, s.user_id as person_id,
           coalesce(nullif(p.name, ''), p.email) as person_name, p.email as person_username,
           c.id as category_id, c.label as category_label, s.photo_number, s.file_name,
           s.content_type, s.file_size, s.uploaded_on
      from public.submissions s
      join public.categories c on c.id = s.category_id
      left join public.profiles p on p.user_id = s.user_id
     where s.has_photo
       and (p_user_id is null or s.user_id = p_user_id)
       and (p_category_id is null or s.category_id = p_category_id)
       and (coalesce(p_number, 0) = 0 or s.photo_number = p_number)
       and (coalesce(p_search, '') = '' or s.file_name ilike v_search)
     order by rn
     offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- Edição manual de uma submissão (campos seguros: nome do ficheiro e número).
create function public.admin_update_submission(p_submission_id uuid, p_file_name text, p_photo_number integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if p_photo_number is null or p_photo_number < 0 then
    raise exception 'O número da fotografia tem de ser 0 ou superior.';
  end if;
  if char_length(coalesce(p_file_name, '')) > 250 then
    raise exception 'O nome do ficheiro é demasiado comprido.';
  end if;
  if not exists (select 1 from public.submissions where id = p_submission_id) then
    raise exception 'Fotografia não encontrada.';
  end if;
  update public.submissions
     set file_name = coalesce(p_file_name, ''), photo_number = p_photo_number
   where id = p_submission_id;
end $$;

create function public.admin_get_submission(p_submission_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
           'submissionId', s.id, 'personName', coalesce(nullif(p.name, ''), p.email),
           'personUsername', p.email, 'categoryId', c.id, 'categoryLabel', c.label,
           'fileName', s.file_name, 'contentType', s.content_type, 'fileSize', s.file_size,
           'uploadedOn', s.uploaded_on, 'photoNumber', s.photo_number)
    into v
    from public.submissions s
    join public.categories c on c.id = s.category_id
    left join public.profiles p on p.user_id = s.user_id
   where s.id = p_submission_id;
  if v is null then raise exception 'Fotografia não encontrada.'; end if;
  return v;
end $$;

create function public.admin_list_votes(p_search text default '', p_offset integer default 0,
                                        p_limit integer default 10, p_sort text default 'voter',
                                        p_desc boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb; v_search text := '%' || coalesce(p_search, '') || '%';
begin
  perform public.require_admin();
  select count(*) into v_total
    from public.votes v join public.profiles p on p.user_id = v.voter_id
   where coalesce(p_search, '') = '' or p.name ilike v_search or p.email ilike v_search;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rn), '[]'::jsonb) into v_rows from (
    select row_number() over (order by
             case when p_sort = 'voter' and not p_desc then coalesce(nullif(p.name, ''), p.email) end asc,
             case when p_sort = 'voter' and p_desc then coalesce(nullif(p.name, ''), p.email) end desc,
             case when p_sort = 'photo' and not p_desc then s.photo_number end asc,
             case when p_sort = 'photo' and p_desc then s.photo_number end desc,
             case when p_sort = 'category' and not p_desc then c.sort_order end asc,
             case when p_sort = 'category' and p_desc then c.sort_order end desc,
             case when p_sort = 'score' and not p_desc then v.score end asc,
             case when p_sort = 'score' and p_desc then v.score end desc,
             v.id) as rn,
           v.id as vote_id, v.voter_id, coalesce(nullif(p.name, ''), p.email) as voter_name,
           s.photo_number, c.label as category_label, v.score, v.voted_on
      from public.votes v
      join public.profiles p on p.user_id = v.voter_id
      join public.submissions s on s.id = v.submission_id
      join public.categories c on c.id = v.category_id
     where coalesce(p_search, '') = '' or p.name ilike v_search or p.email ilike v_search
     order by rn
     offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create function public.admin_get_vote(p_vote_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object('voteId', v.id, 'voterId', v.voter_id, 'submissionId', v.submission_id,
                            'categoryId', v.category_id, 'score', v.score, 'votedOn', v.voted_on)
    into v from public.votes v where v.id = p_vote_id;
  if v is null then raise exception 'Voto não encontrado.'; end if;
  return v;
end $$;

-- Fotografias de uma categoria para o seletor da edição de votos ("007 (Conto)").
create function public.admin_list_category_submissions(p_category_id integer)
returns table (submission_id uuid, label text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.photo_number::text || ' (' || c.label || ')'
    from public.submissions s join public.categories c on c.id = s.category_id
   where s.category_id = p_category_id and s.has_photo and public.is_admin()
   order by s.photo_number, s.id
$$;

-- ----------------------------------------------------------------------- permissões
-- Só utilizadores autenticados chamam funções; nunca o papel anónimo.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname not in ('handle_new_user', 'handle_user_email_change', 'reset_voting_state') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Nenhuma escrita directa em tabelas por clientes (tudo passa pelas funções).
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
