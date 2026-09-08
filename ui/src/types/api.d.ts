// src/types/api.d.ts
// NEW FILE — P1 fix (RENOCORP_PRODUCTION_READINESS.md P1 item #6).
//
// Ambient type declarations for the shapes flowing through the API
// client. These are ".d.ts" (declarations only, no runtime code) so
// they add zero bundle size and require zero changes to existing
// .js/.jsx files — `tsc --checkJs` picks them up automatically for
// any variable annotated with a JSDoc `@type`/`@param` referencing
// them, and plain structural inference benefits even without that.
//
// Deliberately modeled on the backend's actual response shapes
// (modules/withdrawals/models.py, modules/earnings/models.py,
// modules/auth/models.py) — keep these in sync if the backend's
// response shape changes. A future improvement (see
// RENOCORP_PRODUCTION_READINESS.md Phase 4) is generating this file
// automatically from the backend's Pydantic models / OpenAPI schema
// instead of hand-maintaining it, which would make drift impossible
// instead of merely reviewable.

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface ApiErrorShape {
  detail: string;
  code?: string;
  requestId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  membershipTier: string;
  status: "active" | "suspended" | "banned" | "deleted";
  role: "user" | "admin" | "support";
  createdAt: string; // ISO 8601
}

export interface WithdrawalRecord {
  id: string;
  amountUsd: number;
  feeUsd: number;
  netUsd: number;
  network: "MTN" | "AIRTEL";
  provider: "FLUTTERWAVE" | "CHIPPER";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVERSED";
  requestedAt: string;
  processedAt: string | null;
}

export interface EarningRecord {
  id: number;
  type: string;
  amountUsd: number;
  provider: string | null;
  description: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
