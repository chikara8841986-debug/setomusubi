export type UserRole = 'business' | 'msw' | 'admin'

export type Equipment = 'wheelchair' | 'reclining_wheelchair' | 'stretcher'

export type ReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rejected'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          role: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          role?: UserRole
        }
        Relationships: []
      }
      businesses: {
        Row: {
          id: string
          user_id: string
          name: string
          address: string | null
          phone: string | null
          service_areas: string[]
          business_hours_start: string | null
          business_hours_end: string | null
          closed_days: number[]
          has_wheelchair: boolean
          has_reclining_wheelchair: boolean
          has_stretcher: boolean
          rental_wheelchair: boolean
          rental_reclining_wheelchair: boolean
          rental_stretcher: boolean
          has_female_caregiver: boolean
          long_distance: boolean
          same_day: boolean
          qualifications: string | null
          pricing: string | null
          cancel_phone: string | null
          website_url: string | null
          profile_image_url: string | null
          vehicle_image_urls: string[]
          pr_text: string | null
          approved: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          address?: string | null
          phone?: string | null
          service_areas?: string[]
          business_hours_start?: string | null
          business_hours_end?: string | null
          closed_days?: number[]
          has_wheelchair?: boolean
          has_reclining_wheelchair?: boolean
          has_stretcher?: boolean
          rental_wheelchair?: boolean
          rental_reclining_wheelchair?: boolean
          rental_stretcher?: boolean
          has_female_caregiver?: boolean
          long_distance?: boolean
          same_day?: boolean
          qualifications?: string | null
          pricing?: string | null
          cancel_phone?: string | null
          website_url?: string | null
          profile_image_url?: string | null
          vehicle_image_urls?: string[]
          pr_text?: string | null
          approved?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          address?: string | null
          phone?: string | null
          service_areas?: string[]
          business_hours_start?: string | null
          business_hours_end?: string | null
          closed_days?: number[]
          has_wheelchair?: boolean
          has_reclining_wheelchair?: boolean
          has_stretcher?: boolean
          rental_wheelchair?: boolean
          rental_reclining_wheelchair?: boolean
          rental_stretcher?: boolean
          has_female_caregiver?: boolean
          long_distance?: boolean
          same_day?: boolean
          qualifications?: string | null
          pricing?: string | null
          cancel_phone?: string | null
          website_url?: string | null
          profile_image_url?: string | null
          vehicle_image_urls?: string[]
          pr_text?: string | null
          approved?: boolean
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          id: string
          user_id: string
          name: string
          address: string | null
          phone: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          address?: string | null
          phone?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          address?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      msw_contacts: {
        Row: {
          id: string
          hospital_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          hospital_id: string
          name: string
        }
        Update: {
          id?: string
          hospital_id?: string
          name?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          id: string
          hospital_id: string
          business_id: string
          created_at: string
        }
        Insert: {
          id?: string
          hospital_id: string
          business_id: string
        }
        Update: {
          id?: string
          hospital_id?: string
          business_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          id: string
          business_id: string
          name: string
          notes: string | null
          active: boolean
          sort_order: number
          has_wheelchair: boolean
          has_reclining_wheelchair: boolean
          has_stretcher: boolean
          rental_wheelchair: boolean
          rental_reclining_wheelchair: boolean
          rental_stretcher: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          notes?: string | null
          active?: boolean
          sort_order?: number
          has_wheelchair?: boolean
          has_reclining_wheelchair?: boolean
          has_stretcher?: boolean
          rental_wheelchair?: boolean
          rental_reclining_wheelchair?: boolean
          rental_stretcher?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          notes?: string | null
          active?: boolean
          sort_order?: number
          has_wheelchair?: boolean
          has_reclining_wheelchair?: boolean
          has_stretcher?: boolean
          rental_wheelchair?: boolean
          rental_reclining_wheelchair?: boolean
          rental_stretcher?: boolean
          created_at?: string
        }
        Relationships: []
      }
      occupied_slots: {
        Row: {
          id: string
          vehicle_id: string
          date: string
          start_time: string
          end_time: string
          reservation_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          date: string
          start_time: string
          end_time: string
          reservation_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          date?: string
          start_time?: string
          end_time?: string
          reservation_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      availability_slots: {
        Row: {
          id: string
          business_id: string
          date: string
          start_time: string
          end_time: string
          is_available: boolean
          capacity: number
          confirmed_count: number
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          date: string
          start_time: string
          end_time: string
          is_available?: boolean
          capacity?: number
          confirmed_count?: number
        }
        Update: {
          id?: string
          business_id?: string
          date?: string
          start_time?: string
          end_time?: string
          is_available?: boolean
          capacity?: number
          confirmed_count?: number
        }
        Relationships: []
      }
      reservations: {
        Row: {
          id: string
          business_id: string
          hospital_id: string | null
          slot_id: string | null
          vehicle_id: string | null
          source: string
          caller_name: string | null
          caller_phone: string | null
          contact_name: string
          patient_name: string
          patient_address: string
          destination: string
          equipment: Equipment
          equipment_rental: boolean
          notes: string | null
          reservation_date: string
          start_time: string
          end_time: string
          status: ReservationStatus
          reminder_sent: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          hospital_id?: string | null
          slot_id?: string | null
          vehicle_id?: string | null
          source?: string
          caller_name?: string | null
          caller_phone?: string | null
          contact_name: string
          patient_name: string
          patient_address: string
          destination: string
          equipment: Equipment
          equipment_rental?: boolean
          notes?: string | null
          reservation_date: string
          start_time: string
          end_time: string
          status?: ReservationStatus
          reminder_sent?: boolean
        }
        Update: {
          id?: string
          business_id?: string
          hospital_id?: string | null
          slot_id?: string | null
          vehicle_id?: string | null
          source?: string
          caller_name?: string | null
          caller_phone?: string | null
          contact_name?: string
          patient_name?: string
          patient_address?: string
          destination?: string
          equipment?: Equipment
          equipment_rental?: boolean
          notes?: string | null
          reservation_date?: string
          start_time?: string
          end_time?: string
          status?: ReservationStatus
          reminder_sent?: boolean
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      approve_reservation: {
        Args: { p_reservation_id: string }
        Returns: number
      }
      reject_reservation: {
        Args: { p_reservation_id: string }
        Returns: void
      }
      complete_reservation: {
        Args: { p_reservation_id: string }
        Returns: void
      }
      cancel_reservation_by_msw: {
        Args: { p_reservation_id: string }
        Returns: void
      }
      create_phone_reservation: {
        Args: {
          p_date: string
          p_start_time: string
          p_end_time: string
          p_caller_name: string
          p_caller_phone: string
          p_patient_name: string
          p_patient_address: string
          p_destination: string
          p_equipment: Equipment
          p_equipment_rental: boolean
          p_notes: string
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Helper types
export type Business = Database['public']['Tables']['businesses']['Row']
export type Hospital = Database['public']['Tables']['hospitals']['Row']
export type MswContact = Database['public']['Tables']['msw_contacts']['Row']
export type AvailabilitySlot = Database['public']['Tables']['availability_slots']['Row']
export type Reservation = Database['public']['Tables']['reservations']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Favorite = Database['public']['Tables']['favorites']['Row']
export type Vehicle = Database['public']['Tables']['vehicles']['Row']
export type OccupiedSlot = Database['public']['Tables']['occupied_slots']['Row']
