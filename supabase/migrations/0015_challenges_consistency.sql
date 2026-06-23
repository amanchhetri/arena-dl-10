-- 0015_challenges_consistency.sql
-- Preset challenges (created_by NULL, group_id NULL) and custom group
-- challenges (created_by NOT NULL, group_id NOT NULL) are the only two
-- valid shapes. Lock that in at the DB level.

alter table public.challenges
  add constraint challenges_creator_consistency check (
    (created_by is null and group_id is null) or
    (created_by is not null and group_id is not null)
  );
