/** Only the fields the tests read; backend/openapi.json is the full contract. */
export type Category = 'MEALS' | 'HOTEL' | 'LOCAL_CAB' | 'TRAVEL' | 'OTHER';

export interface LineInput {
  category: Category;
  amountPaise: number;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  vendor: string;
  /** Shown as "What was it for?" in the UI; the API requires it. */
  description: string;
  /** Pass a Buffer to upload a receipt with the line; leave out for "no receipt". */
  receipt?: Buffer;
  /** City name (HOTEL lines); resolved to city_id by the claims service. */
  city?: string;
  nights?: number;
}

export interface Finding {
  rule_code: string;
  outcome: 'REJECT' | 'ROUTE' | 'FLAG';
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ClaimLine {
  id: string;
  category: Category;
  vendor: string;
  description: string;
  amount_paise: number;
  expense_date: string;
  status: string;
  receipt: { id: string; sha256: string } | null;
  findings: Finding[];
}

export interface ApprovalStep {
  id: string;
  round: number;
  level_no: number;
  role: 'MANAGER' | 'AUDITOR' | 'FINANCE_HEAD';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT_BACK' | 'SKIPPED' | 'SUPERSEDED';
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  acted_by_id: string | null;
  acted_by_name: string | null;
  on_behalf_of_id: string | null;
  on_behalf_of_name: string | null;
  comment: string | null;
}

export interface Claim {
  id: string;
  claim_no: string;
  title: string;
  status: string;
  version: number;
  owner_id: string;
  owner_name: string;
  total_paise: number;
  payable_paise: number;
  finding_codes: string[];
  has_high_severity: boolean;
  required_levels: number[];
  round: number;
  auto_approved: boolean;
  sample_audit_pending: boolean;
  payout_batch_id: string | null;
  current_step: { id: string; level_no: number; role: string; assigned_to: string | null; assigned_to_name: string | null } | null;
  rejection_reasons: string[];
  lines: ClaimLine[];
  steps: ApprovalStep[];
  comments: Array<{ id: string; body: string; author_name: string }>;
  allowed_actions: string[];
}

export interface Me {
  id: string;
  full_name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'AUDITOR' | 'FINANCE_HEAD';
  department_id: string;
  manager_id: string | null;
  has_reports: boolean;
  permissions: string[];
}

export type DecisionAction = 'approve' | 'reject' | 'send-back';

export interface InboxItem {
  id: string;
  step_id: string;
  claim_no: string;
  status: string;
  delegated_from_name: string | null;
}

export interface BulkItemResult {
  claim_id: string;
  result: 'APPROVED' | 'SKIPPED' | 'FAILED';
  reason: string | null;
}

export interface BulkResult {
  approved: number;
  skipped: number;
  failed: number;
  results: BulkItemResult[];
}

export interface Batch {
  id: string;
  batch_no: string;
  status: 'DRAFT' | 'VERIFIED' | 'EXPORTED' | 'PAID' | 'CANCELLED';
  created_by_id: string;
  verified_by_id: string | null;
  total_paise: number;
  claim_count: number;
  file_sha256: string | null;
  items: Array<{ claim_id: string; amount_paise: number }>;
}

export interface EligibleClaim {
  claim_id: string;
  claim_no: string;
  owner_id: string;
  payable_paise: number;
}

export interface Delegation {
  id: string;
  delegator_name: string;
  delegate_name: string;
  level_no: number;
  is_active: boolean;
}

export interface UserSummary {
  id: string;
  full_name: string;
  role: string;
}
