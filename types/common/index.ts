export interface ApiResponse {
  success: boolean;
  message: string;
}
 
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