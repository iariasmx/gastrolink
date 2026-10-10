import { Restaurant } from "./restaurant.model";

export type UserRole =
  "superadmin" | "business_owner" | "business_admin" | "staff";
export type BusinessRole = Exclude<UserRole, "superadmin">;
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}
export interface UserBusiness extends Restaurant {
  role: UserRole;
}
export interface BusinessUserAssignment {
  id: string;
  user_id: string;
  business_id: string;
  role: BusinessRole;
  email?: string;
}
export interface CurrentSession {
  user: CurrentUser;
  businesses: UserBusiness[];
}
export interface TokenResponse extends CurrentSession {
  access_token: string;
  token_type: string;
}
