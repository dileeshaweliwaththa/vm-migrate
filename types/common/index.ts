export interface ApiResponse {
  success: boolean;
  message: string;
}

// Global RBAC role stored on profiles.role. Ordered least- to most-privileged.
// Single source of truth for the value set (mirrors the `user_role` DB enum).
export const USER_ROLES = ['viewer', 'editor', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
 
export interface ApiSingleResponse<T> extends ApiResponse {
  data: T | null;
}
 
export interface ApiPaginatedResponse<T> extends ApiResponse {
  data: T[] | null;
  count: number;
}
 
export interface AttachmentType {
  uri: string;
  name: string;
  size: number;
  type: string;
}
 
export interface SelectItems {
  label: string;
  value: string;
}