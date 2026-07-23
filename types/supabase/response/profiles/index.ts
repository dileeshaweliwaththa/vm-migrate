import type { UserRole } from '@/types/common';

export interface Profiles {
    id: string
    name: string
    role: UserRole
}

// export type Profiles = Database['public']['Tables']['profiles']['Row'];
