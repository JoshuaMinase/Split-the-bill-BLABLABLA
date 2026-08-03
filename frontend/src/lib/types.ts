// Shared TypeScript types — mirrors the backend MongoDB document shape

export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Receipt {
  merchant_name: string | null;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

export interface Participant {
  id: string;
  name: string;
  device_token: string;
  joined_at: number;
}

export interface Claim {
  item_id: string;
  participant_id: string;
}

export interface Payer {
  participant_id: string;
  account_type: string;
  account_details: string;
}

export interface ParticipantResult {
  subtotal: number;
  tax_share: number;
  tip_share: number;
  total: number;
}

export interface Session {
  id: string;
  token: string;
  status: 'open' | 'locked' | 'settled';
  receipt: Receipt;
  participants: Participant[];
  claims: Claim[];
  payer: Payer | null;
  results: Record<string, ParticipantResult> | null;
  created_at: number;
}

// Draft returned by /api/receipts/parse — before the session is created
export interface ReceiptDraft {
  merchant_name: string | null;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}
