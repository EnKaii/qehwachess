-- Atomic round creation: round + pairings succeed or fail together.
-- SECURITY INVOKER, so the existing RLS policies still decide who may do this.
CREATE OR REPLACE FUNCTION public.create_tournament_round(p_tournament_id uuid, p_pairings jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
  v_next integer;
BEGIN
  IF jsonb_typeof(p_pairings) <> 'array' OR jsonb_array_length(p_pairings) = 0 THEN
    RAISE EXCEPTION 'Pairings must be a non-empty array.';
  END IF;

  -- Serialize concurrent attempts for the same tournament (double click, two tabs).
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament_id::text));

  IF EXISTS (
    SELECT 1 FROM public.tournament_rounds
    WHERE tournament_id = p_tournament_id AND status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Enter all results in the current round before creating the next one.';
  END IF;

  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_next
  FROM public.tournament_rounds WHERE tournament_id = p_tournament_id;

  INSERT INTO public.tournament_rounds (tournament_id, round_number)
  VALUES (p_tournament_id, v_next)
  RETURNING id INTO v_round_id;

  INSERT INTO public.tournament_pairings (round_id, white_player_id, black_player_id, result)
  SELECT v_round_id,
         (e->>'white_player_id')::uuid,
         NULLIF(e->>'black_player_id', '')::uuid,
         COALESCE(e->>'result', 'pending')
  FROM jsonb_array_elements(p_pairings) AS e;

  RETURN v_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament_round(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tournament_round(uuid, jsonb) TO authenticated;

-- Keep round status in sync with its results inside the database,
-- instead of the browser flipping it after each result.
CREATE OR REPLACE FUNCTION public.sync_round_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tournament_rounds r
  SET status = CASE
    WHEN EXISTS (SELECT 1 FROM public.tournament_pairings p WHERE p.round_id = r.id AND p.result = 'pending')
      THEN 'open' ELSE 'completed' END
  WHERE r.id = NEW.round_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_pairings_sync_round ON public.tournament_pairings;
CREATE TRIGGER tournament_pairings_sync_round
  AFTER INSERT OR UPDATE OF result ON public.tournament_pairings
  FOR EACH ROW EXECUTE FUNCTION public.sync_round_status();

-- Live updates for players watching pairings and standings.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_rounds;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_pairings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
