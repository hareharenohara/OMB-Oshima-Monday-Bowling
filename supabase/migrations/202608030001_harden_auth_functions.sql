-- Auth-related SECURITY DEFINER functions must not be callable anonymously.
-- Pin search_path to prevent object-shadowing attacks inside privileged functions.
alter function public.is_admin() set search_path = pg_catalog, public;
alter function public.link_my_account() set search_path = pg_catalog, public;
alter function public.set_member_avatar(uuid, text) set search_path = pg_catalog, public;
alter function public.set_member_equipped_achievement(uuid, text) set search_path = pg_catalog, public;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.link_my_account() from public, anon;
revoke execute on function public.set_member_avatar(uuid, text) from public, anon;
revoke execute on function public.set_member_equipped_achievement(uuid, text) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.link_my_account() to authenticated;
grant execute on function public.set_member_avatar(uuid, text) to authenticated;
grant execute on function public.set_member_equipped_achievement(uuid, text) to authenticated;

-- These request policies are authenticated application routes, not public APIs.
alter policy requests_insert_own on public.requests to authenticated;
alter policy requests_select_admin on public.requests to authenticated;
alter policy requests_select_own on public.requests to authenticated;
alter policy requests_update_admin on public.requests to authenticated;

-- An updated request must remain admin-authorized after the change too.
alter policy requests_update_admin on public.requests
  with check (
    exists (
      select 1
      from public.members
      where members.auth_user_id = (select auth.uid())
        and members.role = 'admin'
        and members.status = '在籍'
    )
  );

-- The bulk score-entry route is admin-only. Enforce the same rule in the API,
-- so a non-admin cannot bypass the UI and insert score rows directly.
alter policy sessions_insert_authenticated on public.sessions
  with check ((select public.is_admin()));
alter policy games_insert_authenticated on public.games
  with check (
    (select public.is_admin())
    and game_number <= (
      select sessions.game_count
      from public.sessions
      where sessions.id = games.session_id
    )
  );
alter policy frames_insert_authenticated on public.frames
  with check ((select public.is_admin()));
