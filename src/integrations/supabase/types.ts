export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      allergen_exposure_logs: {
        Row: {
          allergen_id: string
          allergen_introduction_id: string
          amount_description: string | null
          child_id: string
          created_at: string
          exposure_number: number
          food_form: string | null
          id: string
          logged_at: string
          notes: string | null
          observation_window_ends_at: string | null
          parent_id: string
          reaction_observed: boolean | null
        }
        Insert: {
          allergen_id: string
          allergen_introduction_id: string
          amount_description?: string | null
          child_id: string
          created_at?: string
          exposure_number: number
          food_form?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          observation_window_ends_at?: string | null
          parent_id: string
          reaction_observed?: boolean | null
        }
        Update: {
          allergen_id?: string
          allergen_introduction_id?: string
          amount_description?: string | null
          child_id?: string
          created_at?: string
          exposure_number?: number
          food_form?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          observation_window_ends_at?: string | null
          parent_id?: string
          reaction_observed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "allergen_exposure_logs_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_exposure_logs_allergen_introduction_id_fkey"
            columns: ["allergen_introduction_id"]
            isOneToOne: false
            referencedRelation: "allergen_introductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_exposure_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_exposure_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allergen_introductions: {
        Row: {
          allergen_id: string
          child_id: string
          completed_at: string | null
          created_at: string
          first_introduced_at: string | null
          high_risk_reason: string | null
          id: string
          is_high_risk: boolean | null
          notes: string | null
          parent_id: string
          pediatrician_cleared: boolean | null
          scheduled_introduction_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allergen_id: string
          child_id: string
          completed_at?: string | null
          created_at?: string
          first_introduced_at?: string | null
          high_risk_reason?: string | null
          id?: string
          is_high_risk?: boolean | null
          notes?: string | null
          parent_id: string
          pediatrician_cleared?: boolean | null
          scheduled_introduction_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allergen_id?: string
          child_id?: string
          completed_at?: string | null
          created_at?: string
          first_introduced_at?: string | null
          high_risk_reason?: string | null
          id?: string
          is_high_risk?: boolean | null
          notes?: string | null
          parent_id?: string
          pediatrician_cleared?: boolean | null
          scheduled_introduction_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergen_introductions_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_introductions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_introductions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allergen_reactions: {
        Row: {
          child_id: string
          created_at: string
          emergency_services_called: boolean | null
          epinephrine_used: boolean | null
          exposure_log_id: string
          id: string
          medical_attention_sought: boolean | null
          observed_at: string
          parent_description: string
          parent_id: string
          resolved_at: string | null
          severity: string
          symptoms: string[]
          treatment_given: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          emergency_services_called?: boolean | null
          epinephrine_used?: boolean | null
          exposure_log_id: string
          id?: string
          medical_attention_sought?: boolean | null
          observed_at?: string
          parent_description: string
          parent_id: string
          resolved_at?: string | null
          severity: string
          symptoms: string[]
          treatment_given?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          emergency_services_called?: boolean | null
          epinephrine_used?: boolean | null
          exposure_log_id?: string
          id?: string
          medical_attention_sought?: boolean | null
          observed_at?: string
          parent_description?: string
          parent_id?: string
          resolved_at?: string | null
          severity?: string
          symptoms?: string[]
          treatment_given?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergen_reactions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_reactions_exposure_log_id_fkey"
            columns: ["exposure_log_id"]
            isOneToOne: false
            referencedRelation: "allergen_exposure_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergen_reactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allergens: {
        Row: {
          category: string
          clinical_guidance: string
          clinical_last_reviewed_at: string | null
          clinical_source: string
          clinical_source_url: string | null
          common_forms: string[] | null
          created_at: string
          early_introduction_note: string | null
          id: string
          introduction_age_weeks_max: number | null
          introduction_age_weeks_min: number
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category: string
          clinical_guidance: string
          clinical_last_reviewed_at?: string | null
          clinical_source: string
          clinical_source_url?: string | null
          common_forms?: string[] | null
          created_at?: string
          early_introduction_note?: string | null
          id?: string
          introduction_age_weeks_max?: number | null
          introduction_age_weeks_min: number
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          clinical_guidance?: string
          clinical_last_reviewed_at?: string | null
          clinical_source?: string
          clinical_source_url?: string | null
          common_forms?: string[] | null
          created_at?: string
          early_introduction_note?: string | null
          id?: string
          introduction_age_weeks_max?: number | null
          introduction_age_weeks_min?: number
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      child_speech: {
        Row: {
          achieved_at: string | null
          child_id: string
          created_at: string
          flagged_at: string | null
          id: string
          milestone_id: string
          notes: string | null
          parent_id: string
          pediatrician_notified: boolean | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          child_id: string
          created_at?: string
          flagged_at?: string | null
          id?: string
          milestone_id: string
          notes?: string | null
          parent_id: string
          pediatrician_notified?: boolean | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          child_id?: string
          created_at?: string
          flagged_at?: string | null
          id?: string
          milestone_id?: string
          notes?: string | null
          parent_id?: string
          pediatrician_notified?: boolean | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_milestones_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_milestones_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "speech"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_milestones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          archived_at: string | null
          created_at: string
          date_of_birth: string
          due_date: string | null
          gender: string | null
          id: string
          is_premature: boolean | null
          name: string
          parent_id: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          date_of_birth: string
          due_date?: string | null
          gender?: string | null
          id?: string
          is_premature?: boolean | null
          name: string
          parent_id: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          date_of_birth?: string
          due_date?: string | null
          gender?: string | null
          id?: string
          is_premature?: boolean | null
          name?: string
          parent_id?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_milestones: {
        Row: {
          achieved_at: string
          child_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          parent_id: string
          photo_url: string | null
        }
        Insert: {
          achieved_at?: string
          child_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          parent_id: string
          photo_url?: string | null
        }
        Update: {
          achieved_at?: string
          child_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string
          photo_url?: string | null
        }
        Relationships: []
      }
      diaper_logs: {
        Row: {
          child_id: string
          color: string | null
          consistency: string | null
          created_at: string
          diaper_type: string
          flag_for_attention: boolean | null
          id: string
          logged_at: string
          notes: string | null
          parent_id: string
        }
        Insert: {
          child_id: string
          color?: string | null
          consistency?: string | null
          created_at?: string
          diaper_type: string
          flag_for_attention?: boolean | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id: string
        }
        Update: {
          child_id?: string
          color?: string | null
          consistency?: string | null
          created_at?: string
          diaper_type?: string
          flag_for_attention?: boolean | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diaper_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diaper_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feeding_logs: {
        Row: {
          amount_oz: number | null
          amount_oz_left: number | null
          amount_oz_right: number | null
          child_id: string
          created_at: string
          duration_minutes: number | null
          feeding_type: string
          food_description: string | null
          id: string
          logged_at: string
          notes: string | null
          parent_id: string
          side: string | null
        }
        Insert: {
          amount_oz?: number | null
          amount_oz_left?: number | null
          amount_oz_right?: number | null
          child_id: string
          created_at?: string
          duration_minutes?: number | null
          feeding_type: string
          food_description?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id: string
          side?: string | null
        }
        Update: {
          amount_oz?: number | null
          amount_oz_left?: number | null
          amount_oz_right?: number | null
          child_id?: string
          created_at?: string
          duration_minutes?: number | null
          feeding_type?: string
          food_description?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id?: string
          side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feeding_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feeding_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_checklist_items: {
        Row: {
          annual_limit_note: string | null
          category: string
          created_at: string
          description: string
          disclaimer: string | null
          external_resource_url: string | null
          id: string
          recommended_timing: string | null
          sort_order: number | null
          title: string
          updated_at: string
          why_it_matters: string | null
        }
        Insert: {
          annual_limit_note?: string | null
          category: string
          created_at?: string
          description: string
          disclaimer?: string | null
          external_resource_url?: string | null
          id?: string
          recommended_timing?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Update: {
          annual_limit_note?: string | null
          category?: string
          created_at?: string
          description?: string
          disclaimer?: string | null
          external_resource_url?: string | null
          id?: string
          recommended_timing?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Relationships: []
      }
      illness_logs: {
        Row: {
          child_id: string
          created_at: string
          end_date: string | null
          id: string
          illness_name: string
          notes: string | null
          parent_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          illness_name: string
          notes?: string | null
          parent_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          illness_name?: string
          notes?: string | null
          parent_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "illness_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "illness_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_logs: {
        Row: {
          child_id: string
          created_at: string
          dose: string | null
          end_date: string | null
          frequency: string | null
          id: string
          illness_log_id: string | null
          medication_name: string
          notes: string | null
          parent_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          illness_log_id?: string | null
          medication_name: string
          notes?: string | null
          parent_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          illness_log_id?: string | null
          medication_name?: string
          notes?: string | null
          parent_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_logs_illness_log_id_fkey"
            columns: ["illness_log_id"]
            isOneToOne: false
            referencedRelation: "illness_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_financial_checklist: {
        Row: {
          checklist_item_id: string
          child_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          parent_id: string
          status: string
          updated_at: string
        }
        Insert: {
          checklist_item_id: string
          child_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          parent_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string
          child_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          parent_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_financial_checklist_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "financial_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_financial_checklist_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_financial_checklist_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_access: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          partner_id: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          partner_id: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          partner_id?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: []
      }
      partner_invitations: {
        Row: {
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invite_code: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_code?: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_code?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pediatrician_exports: {
        Row: {
          child_id: string
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          export_type: string
          file_path: string | null
          id: string
          parent_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          export_type: string
          file_path?: string | null
          id?: string
          parent_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          export_type?: string
          file_path?: string | null
          id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pediatrician_exports_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pediatrician_exports_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          data_consent_given_at: string | null
          data_consent_version: string | null
          email: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          data_consent_given_at?: string | null
          data_consent_version?: string | null
          email: string
          full_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          data_consent_given_at?: string | null
          data_consent_version?: string | null
          email?: string
          full_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          child_id: string
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          notes: string | null
          parent_id: string
          quality: string | null
          sleep_type: string
          started_at: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          parent_id: string
          quality?: string | null
          sleep_type: string
          started_at: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          parent_id?: string
          quality?: string | null
          sleep_type?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleep_logs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      speech: {
        Row: {
          age_months_concern_flag: number | null
          age_months_typical_end: number
          age_months_typical_start: number
          category_id: string
          clinical_last_reviewed_at: string | null
          clinical_source: string
          clinical_source_url: string | null
          concern_flag_language: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          age_months_concern_flag?: number | null
          age_months_typical_end: number
          age_months_typical_start: number
          category_id: string
          clinical_last_reviewed_at?: string | null
          clinical_source: string
          clinical_source_url?: string | null
          concern_flag_language?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          age_months_concern_flag?: number | null
          age_months_typical_end?: number
          age_months_typical_start?: number
          category_id?: string
          clinical_last_reviewed_at?: string | null
          clinical_source?: string
          clinical_source_url?: string | null
          concern_flag_language?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "speech_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      speech_categories: {
        Row: {
          created_at: string
          description: string | null
          icon_name: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      speech_journal: {
        Row: {
          child_id: string
          context: string | null
          created_at: string
          entry_date: string
          id: string
          parent_id: string
          word_or_sound: string
        }
        Insert: {
          child_id: string
          context?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          parent_id: string
          word_or_sound: string
        }
        Update: {
          child_id?: string
          context?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          parent_id?: string
          word_or_sound?: string
        }
        Relationships: [
          {
            foreignKeyName: "speech_journal_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speech_journal_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplements: {
        Row: {
          child_id: string
          created_at: string
          form: string | null
          frequency: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          parent_id: string
          started_at: string
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          form?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          parent_id: string
          started_at?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          form?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          parent_id?: string
          started_at?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplements_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_partner_invitation: {
        Args: { _invite_code: string }
        Returns: undefined
      }
      can_access_child: {
        Args: { _child_id: string; _user_id: string }
        Returns: boolean
      }
      has_partner_access: {
        Args: { _owner_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_partner_invitation: {
        Args: { _invite_code: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
