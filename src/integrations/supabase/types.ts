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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cleanup_logs: {
        Row: {
          bytes_freed: number
          company_id: string
          details: Json | null
          executed_at: string
          files_deleted: number
          id: string
        }
        Insert: {
          bytes_freed?: number
          company_id: string
          details?: Json | null
          executed_at?: string
          files_deleted?: number
          id?: string
        }
        Update: {
          bytes_freed?: number
          company_id?: string
          details?: Json | null
          executed_at?: string
          files_deleted?: number
          id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string | null
          employee_count: string | null
          id: string
          industry: string | null
          name: string
          updated_at: string | null
          years_operating: string | null
        }
        Insert: {
          created_at?: string | null
          employee_count?: string | null
          id?: string
          industry?: string | null
          name?: string
          updated_at?: string | null
          years_operating?: string | null
        }
        Update: {
          created_at?: string | null
          employee_count?: string | null
          id?: string
          industry?: string | null
          name?: string
          updated_at?: string | null
          years_operating?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          accounting_method: string | null
          company_id: string
          created_at: string | null
          crm_erp: string | null
          goals: string[] | null
          has_logistics: boolean | null
          has_recurring_clients: boolean | null
          has_stock: boolean | null
          has_wholesale_prices: boolean | null
          id: string
          onboarding_completed: boolean | null
          onboarding_completion_pct: number | null
          sells_products: boolean | null
          sells_services: boolean | null
          sku_count: string | null
          supplier_lead_days: number | null
          updated_at: string | null
          uses_google_ads: boolean | null
          uses_meta_ads: boolean | null
        }
        Insert: {
          accounting_method?: string | null
          company_id: string
          created_at?: string | null
          crm_erp?: string | null
          goals?: string[] | null
          has_logistics?: boolean | null
          has_recurring_clients?: boolean | null
          has_stock?: boolean | null
          has_wholesale_prices?: boolean | null
          id?: string
          onboarding_completed?: boolean | null
          onboarding_completion_pct?: number | null
          sells_products?: boolean | null
          sells_services?: boolean | null
          sku_count?: string | null
          supplier_lead_days?: number | null
          updated_at?: string | null
          uses_google_ads?: boolean | null
          uses_meta_ads?: boolean | null
        }
        Update: {
          accounting_method?: string | null
          company_id?: string
          created_at?: string | null
          crm_erp?: string | null
          goals?: string[] | null
          has_logistics?: boolean | null
          has_recurring_clients?: boolean | null
          has_stock?: boolean | null
          has_wholesale_prices?: boolean | null
          id?: string
          onboarding_completed?: boolean | null
          onboarding_completion_pct?: number | null
          sells_products?: boolean | null
          sells_services?: boolean | null
          sku_count?: string | null
          supplier_lead_days?: number | null
          updated_at?: string | null
          uses_google_ads?: boolean | null
          uses_meta_ads?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_conversations: {
        Row: {
          company_id: string
          id: string
          messages: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          id?: string
          messages?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          id?: string
          messages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_results: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          maturity_classification: string | null
          maturity_scores: Json | null
          pain_point: string | null
          potential_improvement_pct: number | null
          priority_indicators: string[] | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          maturity_classification?: string | null
          maturity_scores?: Json | null
          pain_point?: string | null
          potential_improvement_pct?: number | null
          priority_indicators?: string[] | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          maturity_classification?: string | null
          maturity_scores?: Json | null
          pain_point?: string | null
          potential_improvement_pct?: number | null
          priority_indicators?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      file_extracted_data: {
        Row: {
          chunk_index: number
          company_id: string
          created_at: string | null
          data_category: string
          extracted_json: Json
          file_upload_id: string
          id: string
          row_count: number | null
          summary: string | null
        }
        Insert: {
          chunk_index?: number
          company_id: string
          created_at?: string | null
          data_category?: string
          extracted_json?: Json
          file_upload_id: string
          id?: string
          row_count?: number | null
          summary?: string | null
        }
        Update: {
          chunk_index?: number
          company_id?: string
          created_at?: string | null
          data_category?: string
          extracted_json?: Json
          file_upload_id?: string
          id?: string
          row_count?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_extracted_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_extracted_data_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          company_id: string
          created_at: string | null
          file_hash: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          next_chunk_index: number | null
          priority: number
          processing_error: string | null
          processing_started_at: string | null
          status: string | null
          storage_path: string | null
          total_chunks: number | null
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          file_hash?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          next_chunk_index?: number | null
          priority?: number
          processing_error?: string | null
          processing_started_at?: string | null
          status?: string | null
          storage_path?: string | null
          total_chunks?: number | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          file_hash?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          next_chunk_index?: number | null
          priority?: number
          processing_error?: string | null
          processing_started_at?: string | null
          status?: string | null
          storage_path?: string | null
          total_chunks?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee"
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
      app_role: ["admin", "employee"],
    },
  },
} as const
