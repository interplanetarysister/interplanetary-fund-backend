/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript interfaces mirroring the Convex schema and query return shapes.
// These replace all `any` casts across the frontend.
// ─────────────────────────────────────────────────────────────────────────────

// --- Agents ---

export interface Agent {
  _id: string;
  name: string;
  role: string;
  purpose: string;
  description: string;
  capabilities: string[];
  specialization: string;
  knowledgeAreas: string[];
  trustScore: number;
  reliabilityScore: number;
  efficiencyScore: number;
  collaborationScore: number;
  permissions: string[];
  responsibilities: string[];
  toolsAvailable: string[];
  allowedActions: string[];
  approvalRequired: boolean;
  dataAccessLevel: string;
  limitations?: string[];
  restrictedActions: string[];
  workflowAccess: string[];
  workingMemory: string[];
  longTermMemory: string[];
  managedCampaigns: string[];
  tasksCompleted: number;
  successfulOutcomes: number;
  failedOutcomes: number;
  status: string;
  version: number;
  accentColor: string;
}

export interface AgentSummary {
  name: string;
  role: string;
  status: string;
  trustScore: number;
  tasksCompleted: number;
}

export interface AgentStats {
  total: number;
  active: number;
  averageTrust: number;
  totalTasksCompleted: number;
  totalSuccessfulOutcomes: number;
  totalFailedOutcomes: number;
  agents: AgentSummary[];
}

// --- Campaigns ---

export interface Campaign {
  _id: string;
  ifCampaignId: string;
  title: string;
  status: "active" | "draft" | "completed" | "archived";
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  outreachEnabled: boolean;
  aiTone: string;
  aiIdealDonors: string;
  aiInterestedOrgs: string;
  aiPlatforms: string;
  aiPriority: string;
  storyPresent: boolean;
  summary: string;
  fundraiserEventDescription?: string;
  category: string;
  endDate: string;
  coverImagePresent: boolean;
  coverImageUrl?: string;
  paymentActive: boolean;
  lastSynced: string;
  externalRaised?: number;
  externalDonors?: number;
  platformCount?: number;
  cashappTag?: string;
  frozen?: boolean;
  frozenReason?: string;
  frozenAt?: string;
  ownershipProofStatus?: string;
  ownershipProofNotes?: string;
  ownershipProofRequestedAt?: string;
}

export interface CampaignStats {
  activeCount: number;
  totalRaised: number;
  totalDonors: number;
}

// --- Treasury ---

export interface TreasuryBalances {
  localCampaigns: {
    count: number;
    totalRaised: number;
    totalGoal: number;
    totalDonors: number;
    active: number;
    draft: number;
  };
  externalPlatforms: {
    count: number;
    totalRaised: number;
    totalDonors: number;
    byPlatform: Record<string, number>;
  };
  holdingAccounts: {
    totalHeld: number;
    totalPaidOut: number;
    totalFees: number;
    netPosition: number;
  };
  grandTotal: {
    raised: number;
    donors: number;
    held: number;
  };
}

export interface PayoutCalculation {
  grossAmount: number;
  feeBreakdown: {
    platformFee: { rate: string; amount: number };
    processingFee: { rate: string; flat: number; amount: number };
    totalFees: number;
  };
  netAmount: number;
  display: {
    availableBalance: string;
    youReceive: string;
    ourFee: string;
  };
}

// --- Protocol ---

export interface ProtocolViolation {
  standard: string;
  issue: string;
  severity: string;
}

export interface ProtocolResult {
  title: string;
  complianceScore: number;
  violations: number;
}

export interface ProtocolReport {
  _id: string;
  reportType: string;
  auditDate: string;
  totalCampaigns: number;
  compliantCampaigns: number;
  nonCompliantCampaigns: number;
  totalRaised: number;
  totalGoal: number;
  fundingGap: number;
  totalDonors: number;
  criticalViolations: ProtocolViolation[];
  results: ProtocolResult[];
  syncPerformed: boolean;
}

// --- External Platforms ---

export interface ExternalPlatform {
  _id: string;
  platform: string;
  kind: string;
  displayName: string;
  campaignId: string;
  externalTotal: number;
  externalDonorCount: number;
  status: string;
  automationMode: string;
  externalUrl: string;
  lastSynced: string;
  lastError: string;
  linkClicks?: number;
  listingType?: string;
}

// --- Payment Methods ---

export interface PaymentMethodInfo {
  method: string;
  configured: boolean;
  label: string;
}

export interface AvailablePaymentMethods {
  methods: PaymentMethodInfo[];
}

// --- Donations ---

export interface Donation {
  _id: string;
  campaignId: string;
  campaignTitle: string;
  amount: number;
  donorName: string;
  message?: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  provider?: string;
  currency?: string;
  paymentReference?: string;
  providerTransactionId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
  confirmedAt?: string;
  updatedAt?: string;
}

// --- Transactions ---

export interface Transaction {
  _id: string;
  userId: string;
  type: string;
  amount: number;
  sourcePlatform?: string;
  campaignId?: string;
  payoutRequestId?: string;
  status: string;
  createdAt: string;
  paymentMethod?: string;
  paymentProvider?: string;
  currency?: string;
  providerTransactionId?: string;
  donationId?: string;
  paymentReference?: string;
}

// --- Payout Requests ---

export interface PayoutRequest {
  _id: string;
  userId: string;
  amountRequested: number;
  feeAmount: number;
  netAmount: number;
  payoutMethod: string;
  payoutDestination: string;
  status: string;
  requestedDate: string;
  completedDate?: string;
  transactionId?: string;
  adminReviewStatus?: string;
  adminReviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// --- Holding Accounts ---

export interface HoldingAccount {
  _id: string;
  userId: string;
  totalBalance: number;
  totalFeesDeducted: number;
  totalPaidOut: number;
  pendingPayouts: number;
  lastUpdated: string;
  frozen?: boolean;
}

// --- Interaction Stats ---

export interface InteractionStats {
  campaignId: string;
  campaignTitle: string;
  views: number;
  clicks: number;
  donations: number;
  shares: number;
  total: number;
}
