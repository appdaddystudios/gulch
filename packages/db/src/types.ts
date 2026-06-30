/* v8 ignore start */
// This hand-authored type mirrors the v1 schema. `supabase gen types` can
// regenerate it once the project is linked in a future gated step.

type Json = string | number | boolean | null | { readonly [key: string]: Json | undefined } | readonly Json[];

export type Database = {
  readonly public: {
    readonly Tables: {
      readonly locations: {
        readonly Row: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly name_address: string | null;
          readonly google_maps_url: string | null;
          readonly neighborhood: string | null;
          readonly parking: string | null;
          readonly hide_from_list: boolean;
          readonly is_organizer: boolean;
          readonly managing_organizer_id: string | null;
          readonly latitude: number | null;
          readonly longitude: number | null;
          readonly geocode_status: "pending" | "ok" | "failed" | "manual";
          readonly geocoded_at: string | null;
          readonly webflow_last_updated: string | null;
          readonly created_at: string;
          readonly updated_at: string;
        };
        readonly Insert: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly name_address?: string | null;
          readonly google_maps_url?: string | null;
          readonly neighborhood?: string | null;
          readonly parking?: string | null;
          readonly hide_from_list?: boolean;
          readonly is_organizer?: boolean;
          readonly managing_organizer_id?: string | null;
          readonly latitude?: number | null;
          readonly longitude?: number | null;
          readonly geocode_status?: "pending" | "ok" | "failed" | "manual";
          readonly geocoded_at?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Update: {
          readonly webflow_item_id?: string;
          readonly name?: string;
          readonly slug?: string;
          readonly name_address?: string | null;
          readonly google_maps_url?: string | null;
          readonly neighborhood?: string | null;
          readonly parking?: string | null;
          readonly hide_from_list?: boolean;
          readonly is_organizer?: boolean;
          readonly managing_organizer_id?: string | null;
          readonly latitude?: number | null;
          readonly longitude?: number | null;
          readonly geocode_status?: "pending" | "ok" | "failed" | "manual";
          readonly geocoded_at?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "locations_managing_organizer_id_fkey";
            readonly columns: ["managing_organizer_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "organizers";
            readonly referencedColumns: ["webflow_item_id"];
          }
        ];
      };
      readonly organizers: {
        readonly Row: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly website_url: string | null;
          readonly instagram_url: string | null;
          readonly facebook_url: string | null;
          readonly is_featured: boolean;
          readonly custom_color: string | null;
          readonly webflow_last_updated: string | null;
          readonly created_at: string;
          readonly updated_at: string;
        };
        readonly Insert: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly website_url?: string | null;
          readonly instagram_url?: string | null;
          readonly facebook_url?: string | null;
          readonly is_featured?: boolean;
          readonly custom_color?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Update: {
          readonly webflow_item_id?: string;
          readonly name?: string;
          readonly slug?: string;
          readonly website_url?: string | null;
          readonly instagram_url?: string | null;
          readonly facebook_url?: string | null;
          readonly is_featured?: boolean;
          readonly custom_color?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Relationships: [];
      };
      readonly events: {
        readonly Row: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly start_at: string;
          readonly end_at: string | null;
          readonly custom_time_description: string | null;
          readonly location_id: string | null;
          readonly external_link: string | null;
          readonly tickets_required: boolean;
          readonly webflow_last_updated: string | null;
          readonly created_at: string;
          readonly updated_at: string;
        };
        readonly Insert: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly start_at: string;
          readonly end_at?: string | null;
          readonly custom_time_description?: string | null;
          readonly location_id?: string | null;
          readonly external_link?: string | null;
          readonly tickets_required?: boolean;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Update: {
          readonly webflow_item_id?: string;
          readonly name?: string;
          readonly slug?: string;
          readonly start_at?: string;
          readonly end_at?: string | null;
          readonly custom_time_description?: string | null;
          readonly location_id?: string | null;
          readonly external_link?: string | null;
          readonly tickets_required?: boolean;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "events_location_id_fkey";
            readonly columns: ["location_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "locations";
            readonly referencedColumns: ["webflow_item_id"];
          }
        ];
      };
      readonly shows: {
        readonly Row: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly start_date: string | null;
          readonly end_date: string | null;
          readonly location_id: string | null;
          readonly external_link: string | null;
          readonly webflow_last_updated: string | null;
          readonly created_at: string;
          readonly updated_at: string;
        };
        readonly Insert: {
          readonly webflow_item_id: string;
          readonly name: string;
          readonly slug: string;
          readonly start_date?: string | null;
          readonly end_date?: string | null;
          readonly location_id?: string | null;
          readonly external_link?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Update: {
          readonly webflow_item_id?: string;
          readonly name?: string;
          readonly slug?: string;
          readonly start_date?: string | null;
          readonly end_date?: string | null;
          readonly location_id?: string | null;
          readonly external_link?: string | null;
          readonly webflow_last_updated?: string | null;
          readonly created_at?: string;
          readonly updated_at?: string;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "shows_location_id_fkey";
            readonly columns: ["location_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "locations";
            readonly referencedColumns: ["webflow_item_id"];
          }
        ];
      };
      readonly event_organizers: {
        readonly Row: {
          readonly event_id: string;
          readonly organizer_id: string;
          readonly created_at: string;
        };
        readonly Insert: {
          readonly event_id: string;
          readonly organizer_id: string;
          readonly created_at?: string;
        };
        readonly Update: {
          readonly event_id?: string;
          readonly organizer_id?: string;
          readonly created_at?: string;
        };
        readonly Relationships: [
          {
            readonly foreignKeyName: "event_organizers_event_id_fkey";
            readonly columns: ["event_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "events";
            readonly referencedColumns: ["webflow_item_id"];
          },
          {
            readonly foreignKeyName: "event_organizers_organizer_id_fkey";
            readonly columns: ["organizer_id"];
            readonly isOneToOne: false;
            readonly referencedRelation: "organizers";
            readonly referencedColumns: ["webflow_item_id"];
          }
        ];
      };
    };
    readonly Views: Record<string, never>;
    readonly Functions: Record<string, never>;
    readonly Enums: Record<string, never>;
    readonly CompositeTypes: Record<string, never>;
  };
};

export type { Json };
/* v8 ignore stop */
