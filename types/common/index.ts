export interface ApiResponse {
  success: boolean;
  message: string;
}

// Global RBAC role stored on profiles.role. Ordered least- to most-privileged.
export type UserRole = 'viewer' | 'editor' | 'admin';
 
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