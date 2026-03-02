export interface AuthUser {
  userId: string;
  tenantId?: string;
  scopes: string[];
  tokenType: 'access';
  jti: string;
}
