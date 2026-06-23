-- 0014_groups_rls.sql
-- RLS policies for groups + group_members. Read access scoped to membership;
-- mutations are RPC-only (no INSERT/UPDATE/DELETE policies).

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy groups_select_members on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));

create policy group_members_select_same_group on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
