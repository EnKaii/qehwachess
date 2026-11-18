-- One account type. Everyone is a player; organizing is a permission an admin grants.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_organize boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizer_request_status text CHECK (organizer_request_status IN ('pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS organizer_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS organizer_request_note text;

-- Existing organizers/admins keep the ability; organizers become plain players.
UPDATE public.profiles SET can_organize = true WHERE role IN ('organizer', 'admin');
UPDATE public.profiles SET role = 'player' WHERE role = 'organizer';

-- Sign-up can no longer choose a role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_name text;
  profile_username text;
  profile_city uuid;
  profile_lichess text;
  profile_chesscom text;
  profile_fide_id text;
BEGIN
  profile_name := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  )), '');
  profile_username := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', ''),
    '^@',
    ''
  )), '');
  profile_city := NULLIF(NEW.raw_user_meta_data->>'city_id', '')::uuid;
  profile_lichess := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'lichess_username', ''),
    '^@',
    ''
  )), '');
  profile_chesscom := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'chesscom_username', ''),
    '^@',
    ''
  )), '');
  profile_fide_id := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'fide_id',
    ''
  )), '');

  IF profile_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required.';
  END IF;
  IF profile_username IS NULL OR profile_username !~ '^[A-Za-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'Username must be 3-24 letters, numbers, or underscores.';
  END IF;
  IF profile_city IS NULL THEN
    RAISE EXCEPTION 'City is required.';
  END IF;
  IF profile_lichess IS NULL AND profile_chesscom IS NULL AND profile_fide_id IS NULL THEN
    RAISE EXCEPTION 'Enter at least one Chess.com, Lichess, or FIDE ID.';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, email, role, city_id, username,
    lichess_username, chesscom_username, fide_id
  )
  VALUES (
    NEW.id,
    profile_name,
    COALESCE(NEW.email, ''),
    'player',
    profile_city,
    profile_username,
    profile_lichess,
    profile_chesscom,
    profile_fide_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    city_id = EXCLUDED.city_id,
    username = EXCLUDED.username,
    lichess_username = EXCLUDED.lichess_username,
    chesscom_username = EXCLUDED.chesscom_username,
    fide_id = EXCLUDED.fide_id;

  RETURN NEW;
END;
$$;


-- Close the self-promotion hole: users could set their own role through the update policy.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'player' AND can_organize = false AND organizer_request_status IS NULL);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.can_organize IS DISTINCT FROM OLD.can_organize
      OR NEW.organizer_request_status IS DISTINCT FROM OLD.organizer_request_status
      OR NEW.organizer_requested_at IS DISTINCT FROM OLD.organizer_requested_at)
     AND auth.uid() IS NOT NULL
     AND COALESCE(current_setting('app.privileged', true), '') <> '1'
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'You cannot change role or organizer permissions.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- Request / review flow.
CREATE OR REPLACE FUNCTION public.request_organizer_access(p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  PERFORM set_config('app.privileged', '1', true);
  UPDATE public.profiles
  SET organizer_request_status = 'pending', organizer_requested_at = now(),
      organizer_request_note = NULLIF(btrim(p_note), '')
  WHERE id = auth.uid() AND can_organize = false AND role <> 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_organizer_request(p_user_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can review organizer requests.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.privileged', '1', true);
  UPDATE public.profiles
  SET can_organize = p_approve,
      organizer_request_status = CASE WHEN p_approve THEN NULL ELSE 'rejected' END
  WHERE id = p_user_id AND organizer_request_status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.request_organizer_access(text), public.review_organizer_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_organizer_access(text), public.review_organizer_request(uuid, boolean) TO authenticated;

-- Who may create tournaments / clubs.
DROP POLICY IF EXISTS "Organizers can create tournaments" ON public.tournaments;
CREATE POLICY "Organizers can create tournaments" ON public.tournaments FOR INSERT
  TO authenticated
  WITH CHECK (organizer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.can_organize OR p.role = 'admin')));

DROP POLICY IF EXISTS "Organizers can create clubs" ON public.clubs;
CREATE POLICY "Organizers can create clubs" ON public.clubs FOR INSERT
  TO authenticated
  WITH CHECK (organizer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.can_organize OR p.role = 'admin')));

-- Only admins can publish directly; approved organizers still need approval.
CREATE OR REPLACE FUNCTION public.require_admin_tournament_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_admin boolean;
BEGIN
  SELECT (role = 'admin') INTO is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NOT NULL AND NOT COALESCE(is_admin, false) AND NEW.status = 'published' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'Tournament must be approved by an administrator before publishing.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The organizer of a tournament is automatically confirmed and checked in when they play.
CREATE OR REPLACE FUNCTION public.auto_checkin_organizer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = NEW.tournament_id AND t.organizer_id = NEW.player_id) THEN
    NEW.status := 'confirmed';
    NEW.checked_in_at := COALESCE(NEW.checked_in_at, now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS registrations_auto_checkin_organizer ON public.registrations;
CREATE TRIGGER registrations_auto_checkin_organizer
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.auto_checkin_organizer();

UPDATE public.registrations r SET checked_in_at = now()
FROM public.tournaments t
WHERE t.id = r.tournament_id AND t.organizer_id = r.player_id AND r.checked_in_at IS NULL AND r.status = 'confirmed';
