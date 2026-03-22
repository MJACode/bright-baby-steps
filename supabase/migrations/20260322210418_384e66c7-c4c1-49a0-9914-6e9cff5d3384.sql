
-- Update children table RLS to allow partner access
DROP POLICY "Parents can manage own children" ON public.children;

CREATE POLICY "Parents can manage own children"
  ON public.children FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update feeding_logs table RLS
DROP POLICY "Parents can manage own feeding logs" ON public.feeding_logs;

CREATE POLICY "Parents can manage own feeding logs"
  ON public.feeding_logs FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update diaper_logs table RLS
DROP POLICY "Parents can manage own diaper logs" ON public.diaper_logs;

CREATE POLICY "Parents can manage own diaper logs"
  ON public.diaper_logs FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update sleep_logs table RLS
DROP POLICY "Parents can manage own sleep logs" ON public.sleep_logs;

CREATE POLICY "Parents can manage own sleep logs"
  ON public.sleep_logs FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update child_speech table RLS
DROP POLICY "Parents can manage own child milestones" ON public.child_speech;

CREATE POLICY "Parents can manage own child milestones"
  ON public.child_speech FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update allergen_introductions table RLS
DROP POLICY "Parents can manage own allergen introductions" ON public.allergen_introductions;

CREATE POLICY "Parents can manage own allergen introductions"
  ON public.allergen_introductions FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update allergen_exposure_logs table RLS
DROP POLICY "Parents can manage own exposure logs" ON public.allergen_exposure_logs;

CREATE POLICY "Parents can manage own exposure logs"
  ON public.allergen_exposure_logs FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update allergen_reactions table RLS
DROP POLICY "Parents can manage own reaction logs" ON public.allergen_reactions;

CREATE POLICY "Parents can manage own reaction logs"
  ON public.allergen_reactions FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Update pediatrician_exports table RLS
DROP POLICY "Parents can manage own exports" ON public.pediatrician_exports;

CREATE POLICY "Parents can manage own exports"
  ON public.pediatrician_exports FOR ALL
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
