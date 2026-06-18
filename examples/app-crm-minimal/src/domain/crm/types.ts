export const lifecycleStages = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "patient",
  "active_care",
  "renewal_due",
  "retained",
  "inactive",
  "lost",
  "do_not_contact",
] as const;

export type LifecycleStage = (typeof lifecycleStages)[number];

export const dealStages = [
  "new_lead",
  "qualification",
  "medical_review_pending",
  "medical_review_completed",
  "proposal_requested",
  "proposal_sent",
  "negotiation",
  "payment_pending",
  "won",
  "contract_active",
  "renewal_due",
  "renewed",
  "lost",
] as const;

export type DealStage = (typeof dealStages)[number];

export const contractPlanTypes = ["monthly", "semiannual", "annual"] as const;

export type ContractPlanType = (typeof contractPlanTypes)[number];

export type ContractStatus =
  | "draft"
  | "pending_signature"
  | "active"
  | "renewal_due"
  | "renewed"
  | "expired"
  | "cancelled";

export type TaskStatus = "open" | "done" | "cancelled";

export type ConsentStatus = "granted" | "revoked" | "expired";

export type ConsentPurpose = "marketing" | "operational_communication";

export interface CommunicationPreferences {
  marketingOptOut: boolean;
  marketingOptedOutAt?: string;
  operationalCommunicationAllowed: boolean;
  operationalCommunicationUpdatedAt?: string;
  doNotContact: boolean;
  doNotContactAt?: string;
}

export type AttributionChannel =
  | "blog"
  | "ads"
  | "referral"
  | "organic"
  | "whatsapp_dm"
  | "instagram"
  | "direct"
  | "other";

export type AuditAction =
  | "blog_content_event.created"
  | "contact.created"
  | "lead.created"
  | "deal.created"
  | "contract.created"
  | "task.created"
  | "consent.created"
  | "consent.status_changed"
  | "communication_preferences.changed"
  | "source_attribution.created"
  | "source_attribution.latest_touch_updated"
  | "lifecycle_stage.changed"
  | "deal_stage.changed"
  | "contract_status.changed"
  | "security_access.allowed"
  | "security_access.denied";

export type CrmCollectionName =
  | "blogContentEvents"
  | "contacts"
  | "leads"
  | "deals"
  | "contracts"
  | "tasks"
  | "consents"
  | "sourceAttributions"
  | "auditLogs";

export interface CrmEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact extends CrmEntity {
  fullName: string;
  email?: string;
  phone?: string;
  lifecycleStage: LifecycleStage;
  communicationPreferences: CommunicationPreferences;
  ownerId?: string;
}

export interface BlogContentEvent extends CrmEntity {
  articleSlug: string;
  articleTitle?: string;
  category: string;
  topic?: string;
  cta: string;
  occurredAt: string;
  visitorId?: string;
  sessionId?: string;
  contactId?: string;
  leadId?: string;
}

export interface SourceAttribution extends CrmEntity {
  contactId: string;
  channel: AttributionChannel;
  campaign?: string;
  content?: string;
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  firstTouchAt: string;
  latestChannel?: AttributionChannel;
  latestCampaign?: string;
  latestContent?: string;
  latestLandingPage?: string;
  latestReferrer?: string;
  latestUtmSource?: string;
  latestUtmMedium?: string;
  latestUtmCampaign?: string;
  latestUtmContent?: string;
  latestUtmTerm?: string;
  latestGclid?: string;
  latestGbraid?: string;
  latestWbraid?: string;
  lastTouchAt: string;
}

export interface Lead extends CrmEntity {
  contactId: string;
  lifecycleStage: LifecycleStage;
  sourceAttributionIds: string[];
  interest?: string;
  ownerId?: string;
  nextAction?: string;
}

export interface Deal extends CrmEntity {
  contactId: string;
  leadId: string;
  stage: DealStage;
  sourceAttributionIds: string[];
  title: string;
  valueCents?: number;
  expectedCloseDate?: string;
  lossReason?: string;
  lostAt?: string;
}

export interface Contract extends CrmEntity {
  contactId: string;
  dealId: string;
  planType: ContractPlanType;
  status: ContractStatus;
  sourceAttributionIds: string[];
  startDate: string;
  endDate: string;
  renewalDueAt: string;
  valueCents: number;
}

export interface Task extends CrmEntity {
  contactId: string;
  leadId?: string;
  dealId?: string;
  contractId?: string;
  title: string;
  dueAt: string;
  status: TaskStatus;
  ownerId?: string;
}

export interface Consent extends CrmEntity {
  contactId: string;
  purpose: ConsentPurpose;
  source: string;
  decidedAt: string;
  status: ConsentStatus;
  grantedAt?: string;
  revokedAt?: string;
}

export interface AuditLog extends CrmEntity {
  actorId: string;
  action: AuditAction;
  entityType: CrmCollectionName;
  entityId: string;
  contactId?: string;
  from?: string;
  to?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface LeadProfileWithBlogTouchpoints {
  lead: Lead;
  contact: Contact;
  sourceAttributions: SourceAttribution[];
  blogTouchpoints: BlogContentEvent[];
}

export interface BlogAttributionOutcome {
  event: BlogContentEvent;
  leadIds: string[];
  dealIds: string[];
  contractIds: string[];
  contractValueCents: number;
  renewalContractIds: string[];
}

export interface CrmEntitiesByCollection {
  blogContentEvents: BlogContentEvent;
  contacts: Contact;
  leads: Lead;
  deals: Deal;
  contracts: Contract;
  tasks: Task;
  consents: Consent;
  sourceAttributions: SourceAttribution;
  auditLogs: AuditLog;
}

export type NewBlogContentEvent = Omit<
  BlogContentEvent,
  keyof CrmEntity | "occurredAt"
> & {
  occurredAt?: string;
};

export type NewContact = Omit<
  Contact,
  keyof CrmEntity | "communicationPreferences"
> & {
  lifecycleStage?: LifecycleStage;
  communicationPreferences?: Partial<CommunicationPreferences>;
};

export type NewSourceAttribution = Omit<
  SourceAttribution,
  keyof CrmEntity | "firstTouchAt" | "lastTouchAt"
> & {
  firstTouchAt?: string;
  lastTouchAt?: string;
};

export type NewLead = Omit<Lead, keyof CrmEntity | "sourceAttributionIds"> & {
  lifecycleStage?: LifecycleStage;
  sourceAttributionIds?: string[];
};

export type NewDeal = Omit<Deal, keyof CrmEntity | "stage" | "sourceAttributionIds"> & {
  stage?: DealStage;
  sourceAttributionIds?: string[];
};

export type NewContract = Omit<
  Contract,
  keyof CrmEntity | "status" | "sourceAttributionIds"
> & {
  status?: ContractStatus;
  sourceAttributionIds?: string[];
};

export type NewTask = Omit<Task, keyof CrmEntity | "status"> & {
  status?: TaskStatus;
};

export type NewConsent = Omit<
  Consent,
  keyof CrmEntity | "status" | "source" | "decidedAt"
> & {
  status?: ConsentStatus;
  source?: string;
  decidedAt?: string;
};

export type NewAuditLog = Omit<AuditLog, keyof CrmEntity>;
