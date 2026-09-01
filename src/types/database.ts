export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      actions: {
        Row: {
          action_type: string | null;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          description: string | null;
          due_date: string | null;
          execution_priority: string;
          id: string;
          operational_criticality: string;
          organization_id: string;
          origin: string | null;
          responsible_user_id: string;
          situation: string;
          status: string;
          title: string;
          updated_at: string;
          vessel_id: string | null;
        };
        Insert: {
          action_type?: string | null;
          client_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          execution_priority?: string;
          id?: string;
          operational_criticality?: string;
          organization_id: string;
          origin?: string | null;
          responsible_user_id: string;
          situation?: string;
          status?: string;
          title: string;
          updated_at?: string;
          vessel_id?: string | null;
        };
        Update: {
          action_type?: string | null;
          client_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          execution_priority?: string;
          id?: string;
          operational_criticality?: string;
          organization_id?: string;
          origin?: string | null;
          responsible_user_id?: string;
          situation?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          vessel_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "actions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_responsible_user_id_fkey";
            columns: ["responsible_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_vessel_id_fkey";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          action_id: string | null;
          comment_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deliverable_id: string | null;
          file_name: string;
          id: string;
          mime_type: string | null;
          organization_id: string;
          size_bytes: number | null;
          storage_path: string;
          updated_at: string;
          uploaded_by: string;
        };
        Insert: {
          action_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id?: string | null;
          file_name: string;
          id?: string;
          mime_type?: string | null;
          organization_id: string;
          size_bytes?: number | null;
          storage_path: string;
          updated_at?: string;
          uploaded_by: string;
        };
        Update: {
          action_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id?: string | null;
          file_name?: string;
          id?: string;
          mime_type?: string | null;
          organization_id?: string;
          size_bytes?: number | null;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          event_data: Json;
          event_type: string;
          id: string;
          organization_id: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          event_data?: Json;
          event_type: string;
          id?: string;
          organization_id?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          event_data?: Json;
          event_type?: string;
          id?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          code: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          action_id: string | null;
          author_user_id: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          deliverable_id: string | null;
          id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          action_id?: string | null;
          author_user_id: string;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id?: string | null;
          id?: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          action_id?: string | null;
          author_user_id?: string;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id?: string | null;
          id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_author_user_id_fkey";
            columns: ["author_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverables: {
        Row: {
          action_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          organization_id: string;
          responsible_user_id: string;
          sequence_number: number;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          action_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          organization_id: string;
          responsible_user_id: string;
          sequence_number?: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          action_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          organization_id?: string;
          responsible_user_id?: string;
          sequence_number?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliverables_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_responsible_user_id_fkey";
            columns: ["responsible_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      evidences: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          deliverable_id: string;
          description: string | null;
          file_name: string;
          id: string;
          mime_type: string | null;
          organization_id: string;
          size_bytes: number | null;
          storage_path: string;
          title: string;
          updated_at: string;
          uploaded_by: string;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id: string;
          description?: string | null;
          file_name: string;
          id?: string;
          mime_type?: string | null;
          organization_id: string;
          size_bytes?: number | null;
          storage_path: string;
          title: string;
          updated_at?: string;
          uploaded_by: string;
          version_number?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          deliverable_id?: string;
          description?: string | null;
          file_name?: string;
          id?: string;
          mime_type?: string | null;
          organization_id?: string;
          size_bytes?: number | null;
          storage_path?: string;
          title?: string;
          updated_at?: string;
          uploaded_by?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "evidences_deliverable_id_fkey";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidences_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidences_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_user_id: string | null;
          body: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          notification_type: string;
          organization_id: string;
          read_at: string | null;
          recipient_user_id: string;
          title: string;
        };
        Insert: {
          actor_user_id?: string | null;
          body?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          notification_type: string;
          organization_id: string;
          read_at?: string | null;
          recipient_user_id: string;
          title: string;
        };
        Update: {
          actor_user_id?: string | null;
          body?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          notification_type?: string;
          organization_id?: string;
          read_at?: string | null;
          recipient_user_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          country_code: string;
          created_at: string;
          date_format: string;
          default_language: string;
          deleted_at: string | null;
          id: string;
          legal_name: string;
          name: string;
          primary_email: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          country_code: string;
          created_at?: string;
          date_format?: string;
          default_language?: string;
          deleted_at?: string | null;
          id?: string;
          legal_name: string;
          name: string;
          primary_email: string;
          slug: string;
          status?: Database["public"]["Enums"]["organization_status"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          country_code?: string;
          created_at?: string;
          date_format?: string;
          default_language?: string;
          deleted_at?: string | null;
          id?: string;
          legal_name?: string;
          name?: string;
          primary_email?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["organization_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          full_name: string | null;
          id: string;
          last_login_at: string | null;
          organization_id: string | null;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["profile_status"];
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id: string;
          last_login_at?: string | null;
          organization_id?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id?: string;
          last_login_at?: string | null;
          organization_id?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_vessels: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          organization_id: string;
          profile_id: string;
          vessel_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          organization_id: string;
          profile_id: string;
          vessel_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          organization_id?: string;
          profile_id?: string;
          vessel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_vessels_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_vessels_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_vessels_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_vessels_vessel_id_fkey";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      vessels: {
        Row: {
          client_id: string | null;
          created_at: string;
          deleted_at: string | null;
          dp_class: string | null;
          id: string;
          imo_number: string | null;
          name: string;
          organization_id: string;
          status: string;
          updated_at: string;
          vessel_type: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dp_class?: string | null;
          id?: string;
          imo_number?: string | null;
          name: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
          vessel_type?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dp_class?: string | null;
          id?: string;
          imo_number?: string | null;
          name?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
          vessel_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vessels_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vessels_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_same_org: {
        Args: { _actual: string; _expected: string; _label: string };
        Returns: undefined;
      };
      create_organization: {
        Args: {
          _country_code: string;
          _date_format?: string;
          _default_language?: string;
          _display_name: string;
          _legal_name: string;
          _primary_email: string;
          _status?: Database["public"]["Enums"]["organization_status"];
          _timezone?: string;
        };
        Returns: {
          country_code: string;
          created_at: string;
          date_format: string;
          default_language: string;
          deleted_at: string | null;
          id: string;
          legal_name: string;
          name: string;
          primary_email: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_profile_login: {
        Args: never;
        Returns: Database["public"]["Enums"]["profile_status"];
      };
    };
    Enums: {
      app_role: "system_admin" | "organization_admin" | "member";
      organization_status: "active" | "inactive";
      profile_status: "active" | "inactive" | "blocked";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["system_admin", "organization_admin", "member"],
      organization_status: ["active", "inactive"],
      profile_status: ["active", "inactive", "blocked"],
    },
  },
} as const;
