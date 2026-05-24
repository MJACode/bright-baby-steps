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
      ai_memories: {
        Row: {
          child_id: string | null
          content: string
          created_at: string
          id: string
          pinned: boolean
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          child_id?: string | null
          content: string
          created_at?: string
          id?: string
          pinned?: boolean
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          child_id?: string | null
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
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
      birth_certificates: {
        Row: {
          certificate_number: string | null
          child_id: string
          created_at: string
          date_of_birth: string | null
          id: string
          legal_name: string | null
          parent_id: string
          place_of_birth_city: string | null
          place_of_birth_country: string | null
          place_of_birth_state: string | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          child_id: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          legal_name?: string | null
          parent_id: string
          place_of_birth_city?: string | null
          place_of_birth_country?: string | null
          place_of_birth_state?: string | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          child_id?: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          legal_name?: string | null
          parent_id?: string
          place_of_birth_city?: string | null
          place_of_birth_country?: string | null
          place_of_birth_state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "birth_certificates_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birth_certificates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_notes: {
        Row: {
          author_id: string
          body: string
          child_id: string
          created_at: string
          id: string
          read_at: string | null
        }
        Insert: {
          author_id: string
          body: string
          child_id: string
          created_at?: string
          id?: string
          read_at?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          child_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_notes_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      child_checklist_items: {
        Row: {
          child_id: string
          completed_at: string | null
          created_at: string
          id: string
          item_key: string
          notes: string | null
          parent_id: string
          section: string
          snoozed_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          child_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          item_key: string
          notes?: string | null
          parent_id: string
          section: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          item_key?: string
          notes?: string | null
          parent_id?: string
          section?: string
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_checklist_items_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_checklist_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_memories: {
        Row: {
          category: string
          child_id: string
          confidence: number | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          last_referenced_at: string | null
          pinned: boolean
          source_function: string | null
          updated_at: string
        }
        Insert: {
          category: string
          child_id: string
          confidence?: number | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_referenced_at?: string | null
          pinned?: boolean
          source_function?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          child_id?: string
          confidence?: number | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_referenced_at?: string | null
          pinned?: boolean
          source_function?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_memories_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
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
          birth_weight_oz: number | null
          created_at: string
          date_of_birth: string
          discharge_weight_oz: number | null
          due_date: string | null
          gender: string | null
          id: string
          is_expected: boolean
          is_premature: boolean | null
          name: string
          next_appointment: string | null
          parent_id: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          birth_weight_oz?: number | null
          created_at?: string
          date_of_birth: string
          discharge_weight_oz?: number | null
          due_date?: string | null
          gender?: string | null
          id?: string
          is_expected?: boolean
          is_premature?: boolean | null
          name: string
          next_appointment?: string | null
          parent_id: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          birth_weight_oz?: number | null
          created_at?: string
          date_of_birth?: string
          discharge_weight_oz?: number | null
          due_date?: string | null
          gender?: string | null
          id?: string
          is_expected?: boolean
          is_premature?: boolean | null
          name?: string
          next_appointment?: string | null
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
      college_contributions: {
        Row: {
          amount: number
          contributed_on: string
          created_at: string
          id: string
          parent_id: string
          savings_plan_id: string
        }
        Insert: {
          amount: number
          contributed_on: string
          created_at?: string
          id?: string
          parent_id: string
          savings_plan_id: string
        }
        Update: {
          amount?: number
          contributed_on?: string
          created_at?: string
          id?: string
          parent_id?: string
          savings_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "college_contributions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "college_contributions_savings_plan_id_fkey"
            columns: ["savings_plan_id"]
            isOneToOne: false
            referencedRelation: "college_savings"
            referencedColumns: ["id"]
          },
        ]
      }
      college_savings: {
        Row: {
          account_last_four: string | null
          beneficiary_confirmed: boolean
          child_id: string
          created_at: string
          id: string
          parent_id: string
          plan_name: string | null
          plan_state: string | null
          updated_at: string
        }
        Insert: {
          account_last_four?: string | null
          beneficiary_confirmed?: boolean
          child_id: string
          created_at?: string
          id?: string
          parent_id: string
          plan_name?: string | null
          plan_state?: string | null
          updated_at?: string
        }
        Update: {
          account_last_four?: string | null
          beneficiary_confirmed?: boolean
          child_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          plan_name?: string | null
          plan_state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "college_savings_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "college_savings_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cry_analyses: {
        Row: {
          bucket: string
          child_id: string
          confidence: number
          created_at: string
          features: Json
          id: string
          notes: string | null
          occurred_at: string
          parent_id: string
          user_correction: string | null
        }
        Insert: {
          bucket: string
          child_id: string
          confidence: number
          created_at?: string
          features?: Json
          id?: string
          notes?: string | null
          occurred_at?: string
          parent_id: string
          user_correction?: string | null
        }
        Update: {
          bucket?: string
          child_id?: string
          confidence?: number
          created_at?: string
          features?: Json
          id?: string
          notes?: string | null
          occurred_at?: string
          parent_id?: string
          user_correction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cry_analyses_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cry_analyses_parent_id_fkey"
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
          caption: string | null
          category: string | null
          child_id: string
          confidence: number | null
          created_at: string
          id: string
          name: string
          notes: string | null
          parent_id: string
          photo_path: string | null
          photo_url: string | null
          source: string
        }
        Insert: {
          achieved_at?: string
          caption?: string | null
          category?: string | null
          child_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          parent_id: string
          photo_path?: string | null
          photo_url?: string | null
          source?: string
        }
        Update: {
          achieved_at?: string
          caption?: string | null
          category?: string | null
          child_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string
          photo_path?: string | null
          photo_url?: string | null
          source?: string
        }
        Relationships: []
      }
      dental_visits: {
        Row: {
          child_id: string
          created_at: string
          id: string
          notes: string | null
          parent_id: string
          provider_name: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          notes?: string | null
          parent_id: string
          provider_name?: string | null
          updated_at?: string
          visit_date: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          parent_id?: string
          provider_name?: string | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dental_visits_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dental_visits_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          source: string
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
          source?: string
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
          source?: string
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
      ei_providers: {
        Row: {
          contact: string | null
          created_at: string
          ei_tracker_id: string
          id: string
          name: string
          notes: string | null
          parent_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          ei_tracker_id: string
          id?: string
          name: string
          notes?: string | null
          parent_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          ei_tracker_id?: string
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ei_providers_ei_tracker_id_fkey"
            columns: ["ei_tracker_id"]
            isOneToOne: false
            referencedRelation: "ei_tracker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ei_providers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ei_tracker: {
        Row: {
          child_id: string
          created_at: string
          ei_program_name: string | null
          eligibility: string | null
          eval_date: string | null
          id: string
          ifsp_review_date: string | null
          ifsp_start_date: string | null
          intake_date: string | null
          notes: string | null
          parent_id: string
          referral_date: string | null
          services_json: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          ei_program_name?: string | null
          eligibility?: string | null
          eval_date?: string | null
          id?: string
          ifsp_review_date?: string | null
          ifsp_start_date?: string | null
          intake_date?: string | null
          notes?: string | null
          parent_id: string
          referral_date?: string | null
          services_json?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          ei_program_name?: string | null
          eligibility?: string | null
          eval_date?: string | null
          id?: string
          ifsp_review_date?: string | null
          ifsp_start_date?: string | null
          intake_date?: string | null
          notes?: string | null
          parent_id?: string
          referral_date?: string | null
          services_json?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ei_tracker_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ei_tracker_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      feeding_logs: {
        Row: {
          active_side: string | null
          amount_oz: number | null
          amount_oz_left: number | null
          amount_oz_right: number | null
          child_id: string
          created_at: string
          duration_minutes: number | null
          duration_minutes_left: number | null
          duration_minutes_right: number | null
          feeding_type: string
          food_category: string | null
          food_description: string | null
          id: string
          logged_at: string
          notes: string | null
          parent_id: string
          reaction_description: string | null
          reaction_noted: boolean | null
          side: string | null
          side_started_at: string | null
          source: string
        }
        Insert: {
          active_side?: string | null
          amount_oz?: number | null
          amount_oz_left?: number | null
          amount_oz_right?: number | null
          child_id: string
          created_at?: string
          duration_minutes?: number | null
          duration_minutes_left?: number | null
          duration_minutes_right?: number | null
          feeding_type: string
          food_category?: string | null
          food_description?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id: string
          reaction_description?: string | null
          reaction_noted?: boolean | null
          side?: string | null
          side_started_at?: string | null
          source?: string
        }
        Update: {
          active_side?: string | null
          amount_oz?: number | null
          amount_oz_left?: number | null
          amount_oz_right?: number | null
          child_id?: string
          created_at?: string
          duration_minutes?: number | null
          duration_minutes_left?: number | null
          duration_minutes_right?: number | null
          feeding_type?: string
          food_category?: string | null
          food_description?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          parent_id?: string
          reaction_description?: string | null
          reaction_noted?: boolean | null
          side?: string | null
          side_started_at?: string | null
          source?: string
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
      ferber_check_ins: {
        Row: {
          child_id: string
          created_at: string
          id: string
          interval_index: number
          night_number: number
          parent_id: string
          performed_at: string | null
          scheduled_at: string
          sleep_log_id: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          interval_index: number
          night_number: number
          parent_id: string
          performed_at?: string | null
          scheduled_at: string
          sleep_log_id?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          interval_index?: number
          night_number?: number
          parent_id?: string
          performed_at?: string | null
          scheduled_at?: string
          sleep_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferber_check_ins_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferber_check_ins_sleep_log_id_fkey"
            columns: ["sleep_log_id"]
            isOneToOne: false
            referencedRelation: "sleep_logs"
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
      health_insurance: {
        Row: {
          carrier_name: string | null
          child_id: string
          created_at: string
          dependent_added_date: string | null
          group_number: string | null
          id: string
          member_id: string | null
          open_enrollment_end: string | null
          open_enrollment_start: string | null
          parent_id: string
          pcp_name: string | null
          plan_name: string | null
          plan_type: string | null
          updated_at: string
        }
        Insert: {
          carrier_name?: string | null
          child_id: string
          created_at?: string
          dependent_added_date?: string | null
          group_number?: string | null
          id?: string
          member_id?: string | null
          open_enrollment_end?: string | null
          open_enrollment_start?: string | null
          parent_id: string
          pcp_name?: string | null
          plan_name?: string | null
          plan_type?: string | null
          updated_at?: string
        }
        Update: {
          carrier_name?: string | null
          child_id?: string
          created_at?: string
          dependent_added_date?: string | null
          group_number?: string | null
          id?: string
          member_id?: string | null
          open_enrollment_end?: string | null
          open_enrollment_start?: string | null
          parent_id?: string
          pcp_name?: string | null
          plan_name?: string | null
          plan_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_insurance_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_insurance_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      life_insurance: {
        Row: {
          agent_contact: string | null
          agent_name: string | null
          beneficiary_added: boolean
          carrier: string | null
          child_id: string
          coverage_amount: number | null
          created_at: string
          id: string
          parent_id: string
          policy_number: string | null
          policy_type: string | null
          premium_due_day: number | null
          updated_at: string
        }
        Insert: {
          agent_contact?: string | null
          agent_name?: string | null
          beneficiary_added?: boolean
          carrier?: string | null
          child_id: string
          coverage_amount?: number | null
          created_at?: string
          id?: string
          parent_id: string
          policy_number?: string | null
          policy_type?: string | null
          premium_due_day?: number | null
          updated_at?: string
        }
        Update: {
          agent_contact?: string | null
          agent_name?: string | null
          beneficiary_added?: boolean
          carrier?: string | null
          child_id?: string
          coverage_amount?: number | null
          created_at?: string
          id?: string
          parent_id?: string
          policy_number?: string | null
          policy_type?: string | null
          premium_due_day?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_insurance_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "life_insurance_parent_id_fkey"
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
      milestone_flags: {
        Row: {
          child_id: string
          created_at: string
          dismissed_at: string | null
          dismissed_reason: string | null
          first_flagged_at: string
          id: string
          last_evaluated_at: string
          milestone_id: string
          parent_id: string
          severity: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_reason?: string | null
          first_flagged_at?: string
          id?: string
          last_evaluated_at?: string
          milestone_id: string
          parent_id: string
          severity: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_reason?: string | null
          first_flagged_at?: string
          id?: string
          last_evaluated_at?: string
          milestone_id?: string
          parent_id?: string
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestone_flags_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_flags_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "speech"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_flags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          message: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean
          type?: string
          user_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
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
          consent_acknowledged_at: string | null
          created_at: string
          id: string
          label: string | null
          owner_id: string
          partner_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["partner_role"]
          status: string
        }
        Insert: {
          consent_acknowledged_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          owner_id: string
          partner_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["partner_role"]
          status?: string
        }
        Update: {
          consent_acknowledged_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          owner_id?: string
          partner_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["partner_role"]
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
          invitee_label: string | null
          owner_id: string
          role: Database["public"]["Enums"]["partner_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_code?: string
          invitee_label?: string | null
          owner_id: string
          role?: Database["public"]["Enums"]["partner_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_code?: string
          invitee_label?: string | null
          owner_id?: string
          role?: Database["public"]["Enums"]["partner_role"]
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
      pediatrician_reminders: {
        Row: {
          child_id: string
          created_at: string
          id: string
          include_in_report: boolean
          parent_id: string
          text: string
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          include_in_report?: boolean
          parent_id: string
          text: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          include_in_report?: boolean
          parent_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pediatrician_reminders_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      pediatrician_visits: {
        Row: {
          child_age_months: number | null
          child_id: string
          created_at: string
          id: string
          next_appointment_date: string | null
          notes: string | null
          parent_id: string
          practice_name: string | null
          provider_name: string | null
          updated_at: string
          visit_date: string
          visit_type: string | null
        }
        Insert: {
          child_age_months?: number | null
          child_id: string
          created_at?: string
          id?: string
          next_appointment_date?: string | null
          notes?: string | null
          parent_id: string
          practice_name?: string | null
          provider_name?: string | null
          updated_at?: string
          visit_date: string
          visit_type?: string | null
        }
        Update: {
          child_age_months?: number | null
          child_id?: string
          created_at?: string
          id?: string
          next_appointment_date?: string | null
          notes?: string | null
          parent_id?: string
          practice_name?: string | null
          provider_name?: string | null
          updated_at?: string
          visit_date?: string
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pediatrician_visits_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pediatrician_visits_parent_id_fkey"
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
          coppa_attestation_ip: unknown
          coppa_attestation_signed_at: string | null
          coppa_attestation_signed_name: string | null
          coppa_direct_notice_acknowledged_at: string | null
          created_at: string
          data_consent_given_at: string | null
          data_consent_version: string | null
          email: string
          full_name: string | null
          id: string
          inactive_purge_warned_at: string | null
          onboarding_completed_at: string | null
          updated_at: string
          vpc_completed_at: string | null
          vpc_first_confirmation_at: string | null
          vpc_method: string | null
          vpc_second_confirmation_at: string | null
          vpc_second_token: string | null
          vpc_second_token_expires_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          coppa_attestation_ip?: unknown
          coppa_attestation_signed_at?: string | null
          coppa_attestation_signed_name?: string | null
          coppa_direct_notice_acknowledged_at?: string | null
          created_at?: string
          data_consent_given_at?: string | null
          data_consent_version?: string | null
          email: string
          full_name?: string | null
          id: string
          inactive_purge_warned_at?: string | null
          onboarding_completed_at?: string | null
          updated_at?: string
          vpc_completed_at?: string | null
          vpc_first_confirmation_at?: string | null
          vpc_method?: string | null
          vpc_second_confirmation_at?: string | null
          vpc_second_token?: string | null
          vpc_second_token_expires_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          coppa_attestation_ip?: unknown
          coppa_attestation_signed_at?: string | null
          coppa_attestation_signed_name?: string | null
          coppa_direct_notice_acknowledged_at?: string | null
          created_at?: string
          data_consent_given_at?: string | null
          data_consent_version?: string | null
          email?: string
          full_name?: string | null
          id?: string
          inactive_purge_warned_at?: string | null
          onboarding_completed_at?: string | null
          updated_at?: string
          vpc_completed_at?: string | null
          vpc_first_confirmation_at?: string | null
          vpc_method?: string | null
          vpc_second_confirmation_at?: string | null
          vpc_second_token?: string | null
          vpc_second_token_expires_at?: string | null
        }
        Relationships: []
      }
      rights_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledgement_due_at: string
          admin_notes: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          jurisdiction: string | null
          request_type: string
          response_due_at: string
          status: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledgement_due_at?: string
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          jurisdiction?: string | null
          request_type: string
          response_due_at?: string
          status?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledgement_due_at?: string
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          jurisdiction?: string | null
          request_type?: string
          response_due_at?: string
          status?: string
          user_id?: string | null
          verified_at?: string | null
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
          paused_accumulated_seconds: number
          paused_at: string | null
          quality: string | null
          sleep_type: string
          source: string
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
          paused_accumulated_seconds?: number
          paused_at?: string | null
          quality?: string | null
          sleep_type: string
          source?: string
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
          paused_accumulated_seconds?: number
          paused_at?: string | null
          quality?: string | null
          sleep_type?: string
          source?: string
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
      sleep_plans: {
        Row: {
          bedtime_earliest: string | null
          bedtime_latest: string | null
          bucket: string | null
          bucket_label: string | null
          chair_stage: number | null
          child_id: string
          created_at: string
          ferber_schedule: Json | null
          id: string
          method: string
          nap_count: number | null
          overrides: Json
          parent_id: string
          total_sleep_high: number | null
          total_sleep_low: number | null
          updated_at: string
          wake_time: string | null
          wake_window_high_min: number | null
          wake_window_low_min: number | null
        }
        Insert: {
          bedtime_earliest?: string | null
          bedtime_latest?: string | null
          bucket?: string | null
          bucket_label?: string | null
          chair_stage?: number | null
          child_id: string
          created_at?: string
          ferber_schedule?: Json | null
          id?: string
          method?: string
          nap_count?: number | null
          overrides?: Json
          parent_id: string
          total_sleep_high?: number | null
          total_sleep_low?: number | null
          updated_at?: string
          wake_time?: string | null
          wake_window_high_min?: number | null
          wake_window_low_min?: number | null
        }
        Update: {
          bedtime_earliest?: string | null
          bedtime_latest?: string | null
          bucket?: string | null
          bucket_label?: string | null
          chair_stage?: number | null
          child_id?: string
          created_at?: string
          ferber_schedule?: Json | null
          id?: string
          method?: string
          nap_count?: number | null
          overrides?: Json
          parent_id?: string
          total_sleep_high?: number | null
          total_sleep_low?: number | null
          updated_at?: string
          wake_time?: string | null
          wake_window_high_min?: number | null
          wake_window_low_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_plans_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
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
          flag_severity: string | null
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
          flag_severity?: string | null
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
          flag_severity?: string | null
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          provider: string | null
          provider_subscription_id: string | null
          status: string
          tier: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      vaccinations: {
        Row: {
          child_id: string
          created_at: string
          date_administered: string | null
          declined: boolean
          id: string
          lot_number: string | null
          next_due_date: string | null
          parent_id: string
          provider_name: string | null
          updated_at: string
          vaccine_name: string
        }
        Insert: {
          child_id: string
          created_at?: string
          date_administered?: string | null
          declined?: boolean
          id?: string
          lot_number?: string | null
          next_due_date?: string | null
          parent_id: string
          provider_name?: string | null
          updated_at?: string
          vaccine_name: string
        }
        Update: {
          child_id?: string
          created_at?: string
          date_administered?: string | null
          declined?: boolean
          id?: string
          lot_number?: string | null
          next_due_date?: string | null
          parent_id?: string
          provider_name?: string | null
          updated_at?: string
          vaccine_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          child_id: string
          created_at: string
          head_circumference_cm: number | null
          id: string
          is_pediatrician_visit: boolean
          length_cm: number | null
          logged_at: string
          notes: string | null
          weight_oz: number | null
        }
        Insert: {
          child_id: string
          created_at?: string
          head_circumference_cm?: number | null
          id?: string
          is_pediatrician_visit?: boolean
          length_cm?: number | null
          logged_at?: string
          notes?: string | null
          weight_oz?: number | null
        }
        Update: {
          child_id?: string
          created_at?: string
          head_circumference_cm?: number | null
          id?: string
          is_pediatrician_visit?: boolean
          length_cm?: number | null
          logged_at?: string
          notes?: string | null
          weight_oz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      family_moments: {
        Row: {
          author_id: string | null
          child_id: string | null
          id: string | null
          kind: string | null
          occurred_at: string | null
          payload: Json | null
          source: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _purge_user_data: { Args: { _uid: string }; Returns: undefined }
      accept_partner_invitation: {
        Args: { _invite_code: string }
        Returns: undefined
      }
      can_access_child: {
        Args: { _child_id: string; _user_id: string }
        Returns: boolean
      }
      complete_vpc_second_confirmation: {
        Args: { p_token: string }
        Returns: Json
      }
      delete_user_account: { Args: never; Returns: undefined }
      has_partner_access: {
        Args: { _owner_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_partner_invitation: {
        Args: { _invite_code: string }
        Returns: Json
      }
      partner_can_write: { Args: { _owner_id: string }; Returns: boolean }
      purge_inactive_account: {
        Args: { _target_uid: string }
        Returns: undefined
      }
      users_with_no_logs_since: {
        Args: { since: string }
        Returns: {
          child_id: string
          child_name: string
          user_id: string
        }[]
      }
    }
    Enums: {
      partner_role: "coparent" | "caregiver" | "viewer"
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
    Enums: {
      partner_role: ["coparent", "caregiver", "viewer"],
    },
  },
} as const
