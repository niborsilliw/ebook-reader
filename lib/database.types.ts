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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      bookmarks: {
        Row: {
          book_id: string
          cfi: string
          created_at: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          cfi: string
          created_at?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Update: {
          book_id?: string
          cfi?: string
          created_at?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          chunk_count: number
          cover_path: string | null
          created_at: string
          embedded_count: number
          file_path: string
          file_size: number | null
          id: string
          ingest_attempts: number
          ingest_error: string | null
          ingest_heartbeat_at: string | null
          language: string | null
          status: Database["public"]["Enums"]["ingest_status"]
          title: string | null
          toc: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string | null
          chunk_count?: number
          cover_path?: string | null
          created_at?: string
          embedded_count?: number
          file_path: string
          file_size?: number | null
          id?: string
          ingest_attempts?: number
          ingest_error?: string | null
          ingest_heartbeat_at?: string | null
          language?: string | null
          status?: Database["public"]["Enums"]["ingest_status"]
          title?: string | null
          toc?: Json | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          author?: string | null
          chunk_count?: number
          cover_path?: string | null
          created_at?: string
          embedded_count?: number
          file_path?: string
          file_size?: number | null
          id?: string
          ingest_attempts?: number
          ingest_error?: string | null
          ingest_heartbeat_at?: string | null
          language?: string | null
          status?: Database["public"]["Enums"]["ingest_status"]
          title?: string | null
          toc?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chunks: {
        Row: {
          book_id: string
          chapter_title: string | null
          chunk_index: number
          content: string
          embedding: string | null
          id: number
          spine_href: string
          spine_index: number
          token_count: number
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_title?: string | null
          chunk_index: number
          content: string
          embedding?: string | null
          id?: never
          spine_href: string
          spine_index: number
          token_count: number
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_title?: string | null
          chunk_index?: number
          content?: string
          embedding?: string | null
          id?: never
          spine_href?: string
          spine_index?: number
          token_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          book_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          book_id: string
          cfi_range: string
          chapter_title: string | null
          color: string
          created_at: string
          id: string
          note: string | null
          text: string
          user_id: string
        }
        Insert: {
          book_id: string
          cfi_range: string
          chapter_title?: string | null
          color?: string
          created_at?: string
          id?: string
          note?: string | null
          text: string
          user_id?: string
        }
        Update: {
          book_id?: string
          cfi_range?: string
          chapter_title?: string | null
          color?: string
          created_at?: string
          id?: string
          note?: string | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          citations: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          role: string
          user_id: string
        }
        Insert: {
          citations?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          user_id?: string
        }
        Update: {
          citations?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_positions: {
        Row: {
          book_id: string
          cfi: string
          percentage: number | null
          spine_href: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          cfi: string
          percentage?: number | null
          spine_href?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          book_id?: string
          cfi?: string
          percentage?: number | null
          spine_href?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_positions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_ingest: {
        Args: { p_book_id: string; p_lease_seconds?: number }
        Returns: {
          author: string | null
          chunk_count: number
          cover_path: string | null
          created_at: string
          embedded_count: number
          file_path: string
          file_size: number | null
          id: string
          ingest_attempts: number
          ingest_error: string | null
          ingest_heartbeat_at: string | null
          language: string | null
          status: Database["public"]["Enums"]["ingest_status"]
          title: string | null
          toc: Json | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "books"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_chunks: {
        Args: { p_book_id: string; p_embedding: string; p_k?: number }
        Returns: {
          chapter_title: string
          chunk_index: number
          content: string
          id: number
          similarity: number
          spine_href: string
          spine_index: number
        }[]
      }
      set_chunk_embeddings: {
        Args: { p_book_id: string; p_rows: Json }
        Returns: number
      }
    }
    Enums: {
      ingest_status: "uploaded" | "parsing" | "embedding" | "ready" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ingest_status: ["uploaded", "parsing", "embedding", "ready", "failed"],
    },
  },
} as const
