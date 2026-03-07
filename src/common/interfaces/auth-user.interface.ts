export interface AuthUser {
  userId: string;
  tenantId?: string;
  serviceId?: string;
  scopes: string[];
  tokenType: 'access';
  jti: string;
  localDevToken?: boolean;
}
