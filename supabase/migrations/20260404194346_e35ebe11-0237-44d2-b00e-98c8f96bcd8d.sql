
INSERT INTO illness_logs (id, child_id, parent_id, illness_name, start_date, end_date, notes) VALUES
  ('a9ad1fe4-418f-4774-b153-3e9fabd12901', '3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Common cold', '2025-11-14', '2025-11-19', 'Mild congestion, no fever'),
  ('a9ad1fe4-418f-4774-b153-3e9fabd12902', '3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Stomach bug', '2026-01-13', '2026-01-16', 'Brief vomiting episode'),
  ('a9ad1fe4-418f-4774-b153-3e9fabd12903', '3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Cold', '2026-02-12', '2026-02-16', 'Runny nose and cough'),
  ('a9ad1fe4-418f-4774-b153-3e9fabd12904', '3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Ear infection', '2026-03-14', '2026-03-20', 'Fussy, pulling at right ear');

INSERT INTO medication_logs (child_id, parent_id, illness_log_id, medication_name, dose, frequency, start_date, end_date) VALUES
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'a9ad1fe4-418f-4774-b153-3e9fabd12904', 'Amoxicillin', '5ml', 'twice daily', '2026-03-14', '2026-03-24'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'a9ad1fe4-418f-4774-b153-3e9fabd12901', 'Infant Tylenol', '1.25ml', 'every 6 hours as needed', '2025-11-14', '2025-11-17');

INSERT INTO speech_journal (child_id, parent_id, word_or_sound, entry_date, context) VALUES
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'coo', '2026-01-13', 'during play'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'goo', '2026-01-13', 'at mealtime'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'ahh', '2026-01-15', 'before bed'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'baba', '2026-02-12', 'in the morning'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'dada', '2026-02-14', 'during play'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'mamama', '2026-02-20', 'at mealtime'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'mama', '2026-03-14', 'in the morning'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'dada', '2026-03-15', 'during play'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'bye-bye', '2026-03-20', 'before bed'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'ball', '2026-04-01', 'during play'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'dog', '2026-04-02', 'looking at a book'),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'more', '2026-04-03', 'at mealtime');

INSERT INTO pediatrician_reminders (child_id, parent_id, text, include_in_report) VALUES
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Ask about reflux - seems to spit up after feeds', true),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Check head circumference percentile', true),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Discuss sleep training options', true),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Ask about introducing peanut butter', true),
  ('3b436f98-b2c7-4bd2-aabc-8f521a53a02c', 'a02e07c0-8f60-4461-b4a2-f32bb5f6926c', 'Follow up on ear infection', true);
