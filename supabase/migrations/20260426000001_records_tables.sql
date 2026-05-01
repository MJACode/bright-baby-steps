-- Records tab: medical, insurance, birth certificate, and Early Intervention tracking.
--
-- birth_certificates was added beyond the spec list because the Birth Certificate
-- tab is a persisted form (place of birth + certificate number) and there was no
-- existing table to extend. Placing it here keeps migrations atomic.

CREATE TABLE public.pediatrician_visits (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id               uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id              uuid        NOT NULL REFERENCES public.profiles(id),
  visit_date             date        NOT NULL,
  child_age_months       integer,
  visit_type             text        CHECK (visit_type IN ('well', 'sick', 'follow_up')),
  provider_name          text,
  practice_name          text,
  notes                  text,
  next_appointment_date  date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pediatrician_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own pediatrician visits" ON public.pediatrician_visits
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_pediatrician_visits_updated_at
  BEFORE UPDATE ON public.pediatrician_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.vaccinations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id          uuid        NOT NULL REFERENCES public.profiles(id),
  vaccine_name       text        NOT NULL,
  date_administered  date,
  lot_number         text,
  provider_name      text,
  next_due_date      date,
  declined           boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vaccinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own vaccinations" ON public.vaccinations
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_vaccinations_updated_at
  BEFORE UPDATE ON public.vaccinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.dental_visits (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id      uuid        NOT NULL REFERENCES public.profiles(id),
  visit_date     date        NOT NULL,
  provider_name  text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dental_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own dental visits" ON public.dental_visits
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_dental_visits_updated_at
  BEFORE UPDATE ON public.dental_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.health_insurance (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                uuid        NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id               uuid        NOT NULL REFERENCES public.profiles(id),
  carrier_name            text,
  plan_name               text,
  plan_type               text        CHECK (plan_type IN ('HMO', 'PPO', 'HDHP', 'other')),
  member_id               text,
  group_number            text,
  pcp_name                text,
  open_enrollment_start   date,
  open_enrollment_end     date,
  dependent_added_date    date,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own health insurance" ON public.health_insurance
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_health_insurance_updated_at
  BEFORE UPDATE ON public.health_insurance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.life_insurance (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id           uuid        NOT NULL REFERENCES public.profiles(id),
  policy_type         text,
  carrier             text,
  policy_number       text,
  coverage_amount     numeric,
  beneficiary_added   boolean     NOT NULL DEFAULT false,
  premium_due_day     integer     CHECK (premium_due_day IS NULL OR (premium_due_day BETWEEN 1 AND 31)),
  agent_name          text,
  agent_contact       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.life_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own life insurance" ON public.life_insurance
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_life_insurance_updated_at
  BEFORE UPDATE ON public.life_insurance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.college_savings (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                 uuid        NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id                uuid        NOT NULL REFERENCES public.profiles(id),
  plan_state               text,
  plan_name                text,
  account_last_four        text,
  beneficiary_confirmed    boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.college_savings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own college savings" ON public.college_savings
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_college_savings_updated_at
  BEFORE UPDATE ON public.college_savings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.college_contributions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  savings_plan_id   uuid        NOT NULL REFERENCES public.college_savings(id) ON DELETE CASCADE,
  parent_id         uuid        NOT NULL REFERENCES public.profiles(id),
  amount            numeric     NOT NULL,
  contributed_on    date        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.college_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own college contributions" ON public.college_contributions
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));


CREATE TABLE public.ei_tracker (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid        NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id           uuid        NOT NULL REFERENCES public.profiles(id),
  referral_date       date,
  ei_program_name     text,
  intake_date         date,
  status              text        CHECK (status IN ('referred', 'intake_scheduled', 'eval_scheduled', 'active', 'closed')),
  eval_date           date,
  eligibility         text        CHECK (eligibility IN ('eligible', 'not_eligible', 'pending')),
  ifsp_start_date     date,
  ifsp_review_date    date,
  services_json       jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ei_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own EI tracker" ON public.ei_tracker
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_ei_tracker_updated_at
  BEFORE UPDATE ON public.ei_tracker
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.ei_providers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ei_tracker_id   uuid        NOT NULL REFERENCES public.ei_tracker(id) ON DELETE CASCADE,
  parent_id       uuid        NOT NULL REFERENCES public.profiles(id),
  name            text        NOT NULL,
  role            text,
  contact         text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ei_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own EI providers" ON public.ei_providers
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_ei_providers_updated_at
  BEFORE UPDATE ON public.ei_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.birth_certificates (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                 uuid        NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id                uuid        NOT NULL REFERENCES public.profiles(id),
  legal_name               text,
  date_of_birth            date,
  place_of_birth_city      text,
  place_of_birth_state     text,
  place_of_birth_country   text,
  certificate_number       text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.birth_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can manage own birth certificates" ON public.birth_certificates
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));
CREATE TRIGGER update_birth_certificates_updated_at
  BEFORE UPDATE ON public.birth_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
