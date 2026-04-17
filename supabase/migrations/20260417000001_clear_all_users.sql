-- Pre-launch cleanup: delete all test users and their data.
-- Run order mirrors delete_user_account() to respect FK dependencies.
-- Tables with ON DELETE CASCADE from children are deleted implicitly
-- when the children rows are removed, but we delete them explicitly
-- here for clarity and to avoid any constraint ordering surprises.

DELETE FROM public.chat_messages;
DELETE FROM public.chat_conversations;
DELETE FROM public.notifications;
DELETE FROM public.partner_invitations;
DELETE FROM public.partner_access;
DELETE FROM public.feedback;
DELETE FROM public.parent_financial_checklist;
DELETE FROM public.pediatrician_exports;
DELETE FROM public.pediatrician_reminders;
DELETE FROM public.allergen_exposure_logs;
DELETE FROM public.allergen_introductions;
DELETE FROM public.allergen_reactions;
DELETE FROM public.diaper_logs;
DELETE FROM public.feeding_logs;
DELETE FROM public.sleep_logs;
DELETE FROM public.illness_logs;
DELETE FROM public.medication_logs;
DELETE FROM public.supplement_logs;
DELETE FROM public.speech_journal;
DELETE FROM public.custom_milestones;
DELETE FROM public.pumping_schedules;
DELETE FROM public.children;
DELETE FROM public.profiles;
DELETE FROM auth.users;
