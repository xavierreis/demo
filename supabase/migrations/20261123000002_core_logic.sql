-- Largada de Fotógrafos — lógica de negócio (parte 1): concurso, submissões, votação por categoria.
-- As funções levantam exceções com a mensagem de negócio em português (errcode P0001);
-- qualquer exceção reverte a transação inteira (equivalente aos handlers "reverter" do OutSystems).

-- ------------------------------------------------------------------ utilitários
create function public.pad3(n integer) returns text
language sql immutable set search_path = '' as $$
  select right('000' || coalesce(n, 0)::text, 3)
$$;

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Tens de iniciar sessão.'; end if;
  return auth.uid();
end $$;

create function public.require_participant() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Tens de iniciar sessão.'; end if;
  if not public.is_participant() then
    raise exception 'Não tens permissão para esta operação.';
  end if;
  return auth.uid();
end $$;

create function public.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Não tens permissão para esta operação.';
  end if;
end $$;

create function public.category_status(p_category_id integer) returns public.voting_status
language sql stable security definer set search_path = '' as $$
  select coalesce((select status from public.category_voting where category_id = p_category_id),
                  'por_iniciar'::public.voting_status)
$$;

create function public.final_status() returns public.voting_status
language sql stable security definer set search_path = '' as $$
  select coalesce((select status from public.final_voting_settings where id = 1),
                  'por_iniciar'::public.voting_status)
$$;

create function public.status_label(s public.voting_status) returns text
language sql immutable set search_path = '' as $$
  select case s when 'por_iniciar' then 'Por iniciar'
                when 'a_decorrer' then 'A decorrer'
                else 'Encerrado' end
$$;

-- Submissões abertas? (iniciado e não encerrado)
create function public.check_uploads_open() returns void
language plpgsql stable security definer set search_path = '' as $$
declare c public.contest_settings;
begin
  select * into c from public.contest_settings where id = 1;
  if not (c.contest_started or c.submissions_closed) then
    raise exception 'O concurso ainda não foi iniciado.';
  end if;
  if c.submissions_closed then
    raise exception 'As submissões estão encerradas.';
  end if;
end $$;

-- -------------------------------------------------------------- estado do concurso
create function public.contest_flags() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.contest_settings;
begin
  perform public.require_user();
  select * into c from public.contest_settings where id = 1;
  return jsonb_build_object(
    'started',           c.contest_started or c.submissions_closed,
    'contestStarted',    c.contest_started,
    'submissionsClosed', c.submissions_closed,
    'startedOn',         c.started_on,
    'closedOn',          c.closed_on);
end $$;

create function public.start_contest() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.contest_settings
     set contest_started = true, started_on = now(), started_by = auth.uid()
   where id = 1 and not (contest_started or submissions_closed);
end $$;

create function public.close_submissions() returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contest_settings;
begin
  perform public.require_admin();
  select * into c from public.contest_settings where id = 1;
  if not (c.contest_started or c.submissions_closed) then
    raise exception 'Inicia primeiro o concurso.';
  end if;
  update public.contest_settings
     set submissions_closed = true, closed_on = now(), closed_by = auth.uid()
   where id = 1;
end $$;

create function public.open_submissions() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if public.final_status() <> 'por_iniciar' then
    raise exception 'Já existe votação final iniciada; não é possível reabrir as submissões.';
  end if;
  if exists (select 1 from public.votes) then
    raise exception 'Já existem votos; não é possível reabrir as submissões.';
  end if;
  if exists (select 1 from public.category_voting where status <> 'por_iniciar') then
    raise exception 'Já existem votações iniciadas; não é possível reabrir as submissões.';
  end if;
  update public.contest_settings
     set submissions_closed = false, closed_on = now(), closed_by = auth.uid()
   where id = 1;
end $$;

-- Numeração 1..N por categoria, por ordem de carregamento.
create function public.number_photos() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform public.require_admin();
  if public.final_status() <> 'por_iniciar' then
    raise exception 'Já existe votação final iniciada; não é possível renumerar as fotografias.';
  end if;
  if exists (select 1 from public.votes) then
    raise exception 'Já existem votos; não é possível renumerar as fotografias.';
  end if;
  if exists (select 1 from public.category_voting where status <> 'por_iniciar') then
    raise exception 'Já existem votações iniciadas; não é possível renumerar as fotografias.';
  end if;
  with n as (
    select id, row_number() over (partition by category_id order by uploaded_on, id) as rn
      from public.submissions where has_photo
  )
  update public.submissions s set photo_number = n.rn from n where s.id = n.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ----------------------------------------------------------- submissões (participante)
-- Passo 1: valida o estado e devolve o id da submissão (= nome do ficheiro no storage).
create function public.begin_submission(p_category_id integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_id uuid;
begin
  v_uid := public.require_participant();
  perform public.check_uploads_open();
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Categoria inválida.';
  end if;
  insert into public.submissions (user_id, category_id)
  values (v_uid, p_category_id)
  on conflict (user_id, category_id) do update set user_id = excluded.user_id
  returning id into v_id;
  return v_id;
end $$;

-- Passo 2 (depois do upload para o storage): valida o ficheiro realmente guardado.
create function public.finalize_submission(p_submission_id uuid, p_file_name text, p_content_type text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_size bigint; v_mime text;
begin
  v_uid := public.require_participant();
  perform public.check_uploads_open();
  if not exists (select 1 from public.submissions where id = p_submission_id and user_id = v_uid) then
    raise exception 'Fotografia não encontrada.';
  end if;
  if not (char_length(coalesce(p_content_type, '')) >= 6
          and lower(left(p_content_type, 6)) = 'image/') then
    raise exception 'O ficheiro tem de ser uma imagem.';
  end if;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
    into v_size, v_mime
    from storage.objects o
   where o.bucket_id = 'fotografias' and o.name = p_submission_id::text;
  if not found then
    raise exception 'Seleciona uma fotografia.';
  end if;
  if v_mime is null or lower(left(v_mime, 6)) <> 'image/' then
    raise exception 'O ficheiro tem de ser uma imagem.';
  end if;
  if v_size is null or v_size > 8388608 then
    raise exception 'A fotografia não pode exceder 8 MB.';
  end if;
  update public.submissions
     set file_name = left(coalesce(p_file_name, ''), 250),
         content_type = left(p_content_type, 100),
         file_size = v_size::integer,
         uploaded_on = now(),
         has_photo = true
   where id = p_submission_id;
end $$;

-- Eliminar: o servidor valida (passo 1), apaga o ficheiro do storage e depois a linha (passo 2).
create function public.prepare_delete_my_submission(p_category_id integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_id uuid;
begin
  v_uid := public.require_participant();
  perform public.check_uploads_open();
  select id into v_id from public.submissions
   where user_id = v_uid and category_id = p_category_id;
  return v_id;
end $$;

create function public.delete_my_submission(p_category_id integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  v_uid := public.require_participant();
  perform public.check_uploads_open();
  -- Votos, candidatura e voto final caem em cascata.
  delete from public.submissions where user_id = v_uid and category_id = p_category_id;
end $$;

-- ------------------------------------------------------ votação por categoria
create function public.set_category_voting_status(p_category_id integer, p_new public.voting_status)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_cur public.voting_status; c public.contest_settings;
begin
  perform public.require_admin();
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Categoria inválida.';
  end if;
  v_cur := public.category_status(p_category_id);
  if v_cur = p_new then return; end if;
  if not ((v_cur = 'por_iniciar' and p_new = 'a_decorrer')
       or (v_cur = 'a_decorrer'  and p_new = 'encerrado')
       or (v_cur = 'encerrado'   and p_new = 'a_decorrer')) then
    raise exception 'Transição de estado inválida.';
  end if;
  if v_cur = 'encerrado' and p_new = 'a_decorrer' then
    if public.final_status() <> 'por_iniciar' then
      raise exception 'A votação final já começou; não é possível reabrir esta categoria.';
    end if;
  end if;
  if v_cur = 'por_iniciar' then
    select * into c from public.contest_settings where id = 1;
    if not c.submissions_closed then
      raise exception 'Encerra primeiro as submissões.';
    end if;
    if not exists (select 1 from public.submissions where category_id = p_category_id and has_photo) then
      raise exception 'Esta categoria não tem fotografias.';
    end if;
    if exists (select 1 from public.submissions
                where category_id = p_category_id and has_photo and photo_number <= 0) then
      raise exception 'Numera as fotografias antes de abrir a votação.';
    end if;
  end if;
  insert into public.category_voting (category_id, status, changed_on, changed_by)
  values (p_category_id, p_new, now(), auth.uid())
  on conflict (category_id) do update
    set status = excluded.status, changed_on = excluded.changed_on, changed_by = excluded.changed_by;
end $$;

-- Fotografias da categoria (sem autor) enquanto a votação decorre.
create function public.get_category_photos(p_category_id integer)
returns table (submission_id uuid, photo_number integer, my_score integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.photo_number, coalesce(v.score, 0)::int
    from public.submissions s
    left join public.votes v on v.submission_id = s.id and v.voter_id = auth.uid()
   where public.is_participant()
     and public.category_status(p_category_id) = 'a_decorrer'
     and s.category_id = p_category_id and s.has_photo
   order by case when s.photo_number = 0 then 1000000 else s.photo_number end, s.id
$$;

-- Os meus votos (só com a votação encerrada), da pontuação 5 para a 1.
create function public.get_my_voted_photos(p_category_id integer)
returns table (submission_id uuid, photo_number integer, my_score integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.photo_number, v.score::int
    from public.votes v
    join public.submissions s on s.id = v.submission_id
   where public.is_participant()
     and public.category_status(p_category_id) = 'encerrado'
     and v.voter_id = auth.uid() and v.category_id = p_category_id
   order by v.score desc
$$;

-- Resumo das 5 pontuações atribuídas: "—", "Sem número" ou "Nº 007".
create function public.get_score_summary(p_category_id integer)
returns table (score integer, label text)
language sql stable security definer set search_path = '' as $$
  select g.score,
         case when s.id is null then '—'
              when s.photo_number = 0 then 'Sem número'
              else 'Nº ' || public.pad3(s.photo_number) end
    from generate_series(5, 1, -1) as g(score)
    left join public.votes v
           on v.voter_id = auth.uid() and v.category_id = p_category_id and v.score = g.score
    left join public.submissions s on s.id = v.submission_id
   where auth.uid() is not null
   order by g.score desc
$$;

create function public.save_vote(p_submission_id uuid, p_score integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; v_sub public.submissions; v_status public.voting_status;
  v_old_sub uuid; v_old_number integer; v_info text := '';
begin
  v_uid := public.require_participant();
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'A pontuação tem de estar entre 1 e 5.';
  end if;
  select * into v_sub from public.submissions where id = p_submission_id and has_photo;
  if not found then raise exception 'Fotografia não encontrada.'; end if;
  v_status := public.category_status(v_sub.category_id);
  if v_status <> 'a_decorrer' then
    if v_status = 'encerrado' then
      raise exception 'A votação desta categoria está encerrada.';
    end if;
    raise exception 'A votação desta categoria ainda não começou.';
  end if;
  -- Voltar a votar na mesma fotografia substitui o voto.
  delete from public.votes where voter_id = v_uid and submission_id = p_submission_id;
  -- A pontuação já usada noutra fotografia passa para esta.
  select v.submission_id, s.photo_number into v_old_sub, v_old_number
    from public.votes v join public.submissions s on s.id = v.submission_id
   where v.voter_id = v_uid and v.category_id = v_sub.category_id and v.score = p_score;
  if found then
    v_info := p_score::text
              || case when p_score = 1 then ' ponto passou' else ' pontos passaram' end
              || ' da fotografia Nº ' || public.pad3(v_old_number)
              || ' para a Nº ' || public.pad3(v_sub.photo_number) || '.';
    delete from public.votes
     where voter_id = v_uid and category_id = v_sub.category_id and score = p_score;
  end if;
  insert into public.votes (voter_id, submission_id, category_id, score, voted_on)
  values (v_uid, p_submission_id, v_sub.category_id, p_score, now());
  return jsonb_build_object('infoMessage', v_info);
end $$;

create function public.remove_vote(p_submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_sub public.submissions; v_status public.voting_status;
begin
  v_uid := public.require_participant();
  select * into v_sub from public.submissions where id = p_submission_id;
  if not found then raise exception 'Fotografia não encontrada.'; end if;
  v_status := public.category_status(v_sub.category_id);
  if v_status <> 'a_decorrer' then
    if v_status = 'encerrado' then
      raise exception 'A votação desta categoria está encerrada.';
    end if;
    raise exception 'A votação desta categoria ainda não começou.';
  end if;
  delete from public.votes where voter_id = v_uid and submission_id = p_submission_id;
end $$;

-- Admin: guarda um voto manualmente (ignora o estado da votação; valida as regras de unicidade).
create function public.admin_save_vote(p_vote_id bigint, p_voter_id uuid, p_submission_id uuid, p_score integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_sub public.submissions;
begin
  perform public.require_admin();
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'A pontuação tem de estar entre 1 e 5.';
  end if;
  select * into v_sub from public.submissions where id = p_submission_id;
  if not found then raise exception 'Fotografia não encontrada.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_voter_id) then
    raise exception 'Utilizador não encontrado.';
  end if;
  if exists (select 1 from public.votes
              where voter_id = p_voter_id and submission_id = p_submission_id
                and id is distinct from p_vote_id) then
    raise exception 'Esta pessoa já atribuiu uma pontuação a esta fotografia.';
  end if;
  if exists (select 1 from public.votes
              where voter_id = p_voter_id and category_id = v_sub.category_id and score = p_score
                and submission_id <> p_submission_id and id is distinct from p_vote_id) then
    raise exception 'Esta pessoa já atribuiu % % a outra fotografia desta categoria.',
      p_score, case when p_score = 1 then 'ponto' else 'pontos' end;
  end if;
  if p_vote_id is null then
    insert into public.votes (voter_id, submission_id, category_id, score, voted_on)
    values (p_voter_id, p_submission_id, v_sub.category_id, p_score, now());
  else
    if not exists (select 1 from public.votes where id = p_vote_id) then
      raise exception 'Voto não encontrado.';
    end if;
    update public.votes
       set voter_id = p_voter_id, submission_id = p_submission_id,
           category_id = v_sub.category_id, score = p_score
     where id = p_vote_id;
  end if;
end $$;

-- ------------------------------------------------------------------ visões gerais
create function public.get_voting_overview()
returns table (category_id integer, label text, photo_count integer, my_votes integer,
               status text, status_label text)
language sql stable security definer set search_path = '' as $$
  select c.id::int, c.label,
         (select count(*) from public.submissions s where s.category_id = c.id and s.has_photo)::int,
         (select count(*) from public.votes v where v.category_id = c.id and v.voter_id = auth.uid())::int,
         public.category_status(c.id)::text,
         public.status_label(public.category_status(c.id))
    from public.categories c
   where public.is_participant()
   order by c.sort_order
$$;

create function public.get_admin_voting_overview()
returns table (category_id integer, label text, status text, status_label text,
               photo_count integer, unnumbered_count integer, vote_count integer)
language sql stable security definer set search_path = '' as $$
  select c.id::int, c.label,
         public.category_status(c.id)::text,
         public.status_label(public.category_status(c.id)),
         (select count(*) from public.submissions s where s.category_id = c.id and s.has_photo)::int,
         (select count(*) from public.submissions s
           where s.category_id = c.id and s.has_photo and s.photo_number <= 0)::int,
         (select count(*) from public.votes v where v.category_id = c.id)::int
    from public.categories c
   where public.is_admin()
   order by c.sort_order
$$;

-- Resultados por categoria (só administradores): empates partilham a posição (1, 1, 3).
create function public.get_category_results(p_category_id integer)
returns table (submission_id uuid, photo_number integer, author_name text, author_username text,
               total_points integer, votes_count integer,
               count1 integer, count2 integer, count3 integer, count4 integer, count5 integer,
               rank integer)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select s.id as sid, s.photo_number as pn,
           coalesce(nullif(p.name, ''), p.email, '') as author,
           coalesce(p.email, '') as username,
           coalesce(sum(v.score), 0)::int as total,
           count(v.id)::int as cnt,
           (count(*) filter (where v.score = 1))::int as c1,
           (count(*) filter (where v.score = 2))::int as c2,
           (count(*) filter (where v.score = 3))::int as c3,
           (count(*) filter (where v.score = 4))::int as c4,
           (count(*) filter (where v.score = 5))::int as c5
      from public.submissions s
      left join public.profiles p on p.user_id = s.user_id
      left join public.votes v on v.submission_id = s.id
     where s.category_id = p_category_id and s.has_photo and public.is_admin()
     group by s.id, s.photo_number, p.name, p.email
  )
  select sid, pn, author, username, total, cnt, c1, c2, c3, c4, c5,
         (rank() over (order by total desc))::int
    from agg
   order by total desc, c5 desc, c4 desc, c3 desc, c2 desc, pn, sid
$$;

-- Votantes e votantes "completos" (usaram as 5 pontuações).
create function public.get_category_voting_stats(p_category_id integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'votersCount',         count(*),
    'completeVotersCount', count(*) filter (where n = 5))
  from (
    select v.voter_id, count(distinct v.score) as n
      from public.votes v
     where v.category_id = p_category_id and v.score between 1 and 5 and public.is_admin()
     group by v.voter_id
  ) t
$$;
