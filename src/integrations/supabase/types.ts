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
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          module: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          module: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          module?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_plans: {
        Row: {
          assigned_auditor_id: string | null
          assignment_strategy: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          entity_type: string
          id: string
          name: string
          recurrence_pattern: Json | null
          scope: Json | null
          status: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_auditor_id?: string | null
          assignment_strategy?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entity_type: string
          id?: string
          name: string
          recurrence_pattern?: Json | null
          scope?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_auditor_id?: string | null
          assignment_strategy?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          name?: string
          recurrence_pattern?: Json | null
          scope?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_plans_assigned_auditor_id_fkey"
            columns: ["assigned_auditor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_results: {
        Row: {
          audit_id: string | null
          created_at: string | null
          evidence_urls: string[] | null
          id: string
          item_id: string
          points_earned: number | null
          response: Json
          section_id: string
          updated_at: string | null
        }
        Insert: {
          audit_id?: string | null
          created_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          item_id: string
          points_earned?: number | null
          response: Json
          section_id: string
          updated_at?: string | null
        }
        Update: {
          audit_id?: string | null
          created_at?: string | null
          evidence_urls?: string[] | null
          id?: string
          item_id?: string
          points_earned?: number | null
          response?: Json
          section_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_results_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_templates: {
        Row: {
          checklist_json: Json
          code: string
          created_at: string | null
          created_by: string | null
          entity_type: string
          id: string
          languages: Json | null
          name: string
          scoring_config: Json
          status: string | null
          type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          checklist_json: Json
          code: string
          created_at?: string | null
          created_by?: string | null
          entity_type: string
          id?: string
          languages?: Json | null
          name: string
          scoring_config: Json
          status?: string | null
          type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          checklist_json?: Json
          code?: string
          created_at?: string | null
          created_by?: string | null
          entity_type?: string
          id?: string
          languages?: Json | null
          name?: string
          scoring_config?: Json
          status?: string | null
          type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          audit_code: string
          auditor_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          pass_fail: string | null
          plan_id: string | null
          scheduled_date: string
          score: number | null
          started_at: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          audit_code: string
          auditor_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          pass_fail?: string | null
          plan_id?: string | null
          scheduled_date: string
          score?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_code?: string
          auditor_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          pass_fail?: string | null
          plan_id?: string | null
          scheduled_date?: string
          score?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "audit_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bcks: {
        Row: {
          address: string | null
          certifications: Json | null
          city: string
          code: string
          created_at: string | null
          email: string | null
          health_score: number | null
          id: string
          manager_id: string | null
          name: string
          phone: string | null
          production_capacity: number | null
          region_id: string | null
          status: string | null
          supplies_branches: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          certifications?: Json | null
          city: string
          code: string
          created_at?: string | null
          email?: string | null
          health_score?: number | null
          id?: string
          manager_id?: string | null
          name: string
          phone?: string | null
          production_capacity?: number | null
          region_id?: string | null
          status?: string | null
          supplies_branches?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          certifications?: Json | null
          city?: string
          code?: string
          created_at?: string | null
          email?: string | null
          health_score?: number | null
          id?: string
          manager_id?: string | null
          name?: string
          phone?: string | null
          production_capacity?: number | null
          region_id?: string | null
          status?: string | null
          supplies_branches?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bcks_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bcks_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string
          code: string
          created_at: string | null
          email: string | null
          health_score: number | null
          id: string
          manager_id: string | null
          name: string
          opening_date: string | null
          phone: string | null
          region_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city: string
          code: string
          created_at?: string | null
          email?: string | null
          health_score?: number | null
          id?: string
          manager_id?: string | null
          name: string
          opening_date?: string | null
          phone?: string | null
          region_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          code?: string
          created_at?: string | null
          email?: string | null
          health_score?: number | null
          id?: string
          manager_id?: string | null
          name?: string
          opening_date?: string | null
          phone?: string | null
          region_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      capa: {
        Row: {
          assigned_to: string | null
          audit_id: string | null
          capa_code: string
          created_at: string | null
          description: string
          due_date: string
          entity_id: string
          entity_type: string
          evidence_urls: string[] | null
          finding_id: string | null
          id: string
          notes: string | null
          priority: string
          status: string | null
          sub_tasks: Json | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          audit_id?: string | null
          capa_code: string
          created_at?: string | null
          description: string
          due_date: string
          entity_id: string
          entity_type: string
          evidence_urls?: string[] | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          priority: string
          status?: string | null
          sub_tasks?: Json | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          audit_id?: string | null
          capa_code?: string
          created_at?: string | null
          description?: string
          due_date?: string
          entity_id?: string
          entity_type?: string
          evidence_urls?: string[] | null
          finding_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string | null
          sub_tasks?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capa_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capa_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capa_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
        ]
      }
      capa_activity: {
        Row: {
          action: string
          capa_id: string | null
          created_at: string | null
          details: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          capa_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          capa_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capa_activity_capa_id_fkey"
            columns: ["capa_id"]
            isOneToOne: false
            referencedRelation: "capa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capa_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          audit_id: string | null
          category: string
          created_at: string | null
          description: string
          evidence_urls: string[] | null
          finding_code: string
          id: string
          item_id: string
          section_name: string
          severity: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          audit_id?: string | null
          category: string
          created_at?: string | null
          description: string
          evidence_urls?: string[] | null
          finding_code: string
          id?: string
          item_id: string
          section_name: string
          severity: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          evidence_urls?: string[] | null
          finding_code?: string
          id?: string
          item_id?: string
          section_name?: string
          severity?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "findings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scores: {
        Row: {
          calculated_at: string | null
          components: Json
          entity_id: string
          entity_type: string
          id: string
          score: number
        }
        Insert: {
          calculated_at?: string | null
          components: Json
          entity_id: string
          entity_type: string
          id?: string
          score: number
        }
        Update: {
          calculated_at?: string | null
          components?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          score?: number
        }
        Relationships: []
      }
      incidents: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string
          entity_id: string
          entity_type: string
          evidence_urls: string[] | null
          id: string
          incident_code: string
          related_audit_id: string | null
          resolution_notes: string | null
          severity: string
          status: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          entity_id: string
          entity_type: string
          evidence_urls?: string[] | null
          id?: string
          incident_code: string
          related_audit_id?: string | null
          resolution_notes?: string | null
          severity: string
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          entity_id?: string
          entity_type?: string
          evidence_urls?: string[] | null
          id?: string
          incident_code?: string
          related_audit_id?: string | null
          resolution_notes?: string | null
          severity?: string
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_related_audit_id_fkey"
            columns: ["related_audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          link_to: string | null
          message: string
          read: boolean | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          link_to?: string | null
          message: string
          read?: boolean | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          link_to?: string | null
          message?: string
          read?: boolean | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          manager_id: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          certifications: Json | null
          city: string | null
          code: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          id: string
          name: string
          quality_score: number | null
          registration_number: string | null
          risk_level: string
          status: string | null
          supplies_to: Json | null
          type: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          certifications?: Json | null
          city?: string | null
          code: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          name: string
          quality_score?: number | null
          registration_number?: string | null
          risk_level: string
          status?: string | null
          supplies_to?: Json | null
          type: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          certifications?: Json | null
          city?: string | null
          code?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          id?: string
          name?: string
          quality_score?: number | null
          registration_number?: string | null
          risk_level?: string
          status?: string | null
          supplies_to?: Json | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_assignments: {
        Row: {
          assigned_id: string
          assigned_type: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          assigned_id: string
          assigned_type: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          assigned_id?: string
          assigned_type?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          last_login: string | null
          phone: string | null
          role: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          last_login?: string | null
          phone?: string | null
          role: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          last_login?: string | null
          phone?: string | null
          role?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
