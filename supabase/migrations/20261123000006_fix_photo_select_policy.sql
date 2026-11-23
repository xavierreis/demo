-- O upload (INSERT ... RETURNING, com upsert) também passa pela política de SELECT do storage:
-- o dono tem de poder ler a sua própria submissão mesmo antes de ela estar validada (has_photo).
create or replace function public.can_read_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_participant() and exists (
      select 1 from public.submissions s
       where s.id::text = p_name
         and (
           s.user_id = auth.uid()
           or (s.has_photo and (
             exists (select 1 from public.category_voting cv
                      where cv.category_id = s.category_id and cv.status = 'a_decorrer')
             or exists (select 1 from public.category_voting cv
                         join public.votes v on v.submission_id = s.id and v.voter_id = auth.uid()
                        where cv.category_id = s.category_id and cv.status = 'encerrado')
             or exists (select 1 from public.final_candidates fc
                         cross join public.final_voting_settings f
                        where fc.submission_id = s.id and f.status in ('a_decorrer', 'encerrado'))
           ))
         )
    )
  )
$$;
