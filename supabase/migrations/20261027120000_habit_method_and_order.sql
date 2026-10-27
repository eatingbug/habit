-- #185: execution method is independent of cue. Order writes never rewrite designs.
alter table public.habits add column method text;
alter table public.habits add column sort_order integer;

-- Invoker security preserves the existing habits RLS boundary. One RPC is one transaction.
create function public.reorder_habits(habit_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if habit_ids is null or cardinality(habit_ids) <> (
    select count(distinct id) from unnest(habit_ids) as requested(id)
  ) then
    raise exception 'Invalid habit order';
  end if;

  -- Serialize edits for this user's existing habits before computing slots.
  perform id from public.habits where user_id = auth.uid() order by id for update;
  if cardinality(habit_ids) <> (
    select count(*) from public.habits where user_id = auth.uid() and id = any(habit_ids)
  ) then
    raise exception 'Unknown habit in order';
  end if;

  -- Only replace the selected slots. Paused, archived or concurrently added habits stay put.
  with slots as (
    select id,
      (row_number() over w - 1)::integer as position,
      (count(*) filter (where id = any(habit_ids)) over w)::integer as selected_position
    from public.habits
    where user_id = auth.uid()
    window w as (order by sort_order nulls last, created_at, id rows unbounded preceding)
  ), reordered as (
    select position,
      case when id = any(habit_ids) then habit_ids[selected_position] else id end as next_id
    from slots
  )
  update public.habits as h set sort_order = r.position
  from reordered as r where h.id = r.next_id and h.user_id = auth.uid();
end;
$$;

revoke all on function public.reorder_habits(uuid[]) from public, anon;
grant execute on function public.reorder_habits(uuid[]) to authenticated;
