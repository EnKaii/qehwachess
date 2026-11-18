-- Players report their own game; the opponent confirms; the organizer settles disputes.
ALTER TABLE public.tournament_pairings
  ADD COLUMN IF NOT EXISTS proposed_result text CHECK (proposed_result IN ('white_win', 'black_win', 'draw')),
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disputed boolean NOT NULL DEFAULT false;

-- Whenever a result is set (by agreement or by the organizer), clear any open proposal/dispute.
CREATE OR REPLACE FUNCTION public.clear_result_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.result <> 'pending' THEN
    NEW.proposed_result := NULL;
    NEW.proposed_by := NULL;
    NEW.disputed := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tournament_pairings_clear_proposal ON public.tournament_pairings;
CREATE TRIGGER tournament_pairings_clear_proposal
  BEFORE UPDATE OF result ON public.tournament_pairings
  FOR EACH ROW EXECUTE FUNCTION public.clear_result_proposal();

-- One of the two players reports a result. Returns 'proposed', 'confirmed' or 'disputed'.
CREATE OR REPLACE FUNCTION public.report_pairing_result(p_pairing_id uuid, p_result text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.tournament_pairings%ROWTYPE;
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF p_result NOT IN ('white_win', 'black_win', 'draw') THEN RAISE EXCEPTION 'Invalid result.'; END IF;
  SELECT * INTO g FROM public.tournament_pairings WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found.'; END IF;
  IF g.black_player_id IS NULL OR me NOT IN (g.white_player_id, g.black_player_id) THEN
    RAISE EXCEPTION 'Only the two players of this game can report its result.';
  END IF;
  IF g.result <> 'pending' THEN
    RAISE EXCEPTION 'This result is already confirmed. Ask the organizer to change it.';
  END IF;

  IF g.proposed_by IS NULL OR g.proposed_by = me THEN
    UPDATE public.tournament_pairings
      SET proposed_result = p_result, proposed_by = me, disputed = false WHERE id = g.id;
    RETURN 'proposed';
  ELSIF g.proposed_result = p_result THEN
    UPDATE public.tournament_pairings SET result = p_result WHERE id = g.id;
    RETURN 'confirmed';
  ELSE
    UPDATE public.tournament_pairings SET disputed = true WHERE id = g.id;
    RETURN 'disputed';
  END IF;
END;
$$;

-- The opponent rejects the reported result without proposing another one.
CREATE OR REPLACE FUNCTION public.dispute_pairing_result(p_pairing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.tournament_pairings%ROWTYPE;
  me uuid := auth.uid();
BEGIN
  SELECT * INTO g FROM public.tournament_pairings WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR g.black_player_id IS NULL OR me NOT IN (g.white_player_id, g.black_player_id) THEN
    RAISE EXCEPTION 'Only the two players of this game can dispute its result.';
  END IF;
  IF g.result <> 'pending' OR g.proposed_by IS NULL OR g.proposed_by = me THEN
    RAISE EXCEPTION 'There is no opponent report to dispute.';
  END IF;
  UPDATE public.tournament_pairings SET disputed = true WHERE id = g.id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_pairing_result(uuid, text), public.dispute_pairing_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_pairing_result(uuid, text), public.dispute_pairing_result(uuid) TO authenticated;
