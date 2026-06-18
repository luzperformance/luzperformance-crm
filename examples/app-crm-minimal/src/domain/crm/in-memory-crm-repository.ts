import { buildMedicalGovernanceAuditMetadata } from "./medical-governance-policy";
import type {
  AuditLog,
  BlogAttributionOutcome,
  BlogContentEvent,
  CommunicationPreferences,
  Contact,
  Consent,
  ConsentStatus,
  Contract,
  CrmCollectionName,
  CrmEntitiesByCollection,
  CrmEntity,
  Deal,
  Lead,
  LeadProfileWithBlogTouchpoints,
  NewAuditLog,
  NewBlogContentEvent,
  NewConsent,
  NewContact,
  NewContract,
  NewDeal,
  NewLead,
  NewSourceAttribution,
  NewTask,
  SourceAttribution,
  Task,
} from "./types";

type CreateInputByCollection = {
  blogContentEvents: NewBlogContentEvent;
  contacts: NewContact;
  leads: NewLead;
  deals: NewDeal;
  contracts: NewContract;
  tasks: NewTask;
  consents: NewConsent;
  sourceAttributions: NewSourceAttribution;
  auditLogs: NewAuditLog;
};

type UpdateInput<T extends CrmEntity> = Partial<Omit<T, keyof CrmEntity>>;

interface RepositoryOptions {
  clock?: () => Date;
  idFactory?: (collection: CrmCollectionName) => string;
}

interface UpdateDealStageOptions {
  actorId?: string;
  lossReason?: string;
}

interface ConsentStatusChangeOptions {
  actorId?: string;
  source?: string;
  decidedAt?: string;
}

interface CommunicationPreferenceChangeOptions {
  actorId?: string;
  source?: string;
  changedAt?: string;
}

const defaultCommunicationPreferences: CommunicationPreferences = {
  marketingOptOut: false,
  operationalCommunicationAllowed: true,
  doNotContact: false,
};

const collections: CrmCollectionName[] = [
  "blogContentEvents",
  "contacts",
  "leads",
  "deals",
  "contracts",
  "tasks",
  "consents",
  "sourceAttributions",
  "auditLogs",
];

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryCrmRepository {
  private readonly tables = new Map<
    CrmCollectionName,
    Map<string, CrmEntitiesByCollection[CrmCollectionName]>
  >();

  private counters = new Map<CrmCollectionName, number>();

  private readonly clock: () => Date;

  private readonly idFactory?: (collection: CrmCollectionName) => string;

  constructor(options: RepositoryOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory;

    for (const collection of collections) {
      this.tables.set(collection, new Map());
      this.counters.set(collection, 0);
    }
  }

  createContact(input: NewContact): Contact {
    const contact = this.create("contacts", {
      ...input,
      lifecycleStage: input.lifecycleStage ?? "subscriber",
      communicationPreferences: {
        ...defaultCommunicationPreferences,
        ...input.communicationPreferences,
      },
    });

    this.createAuditLog({
      actorId: "system",
      action: "contact.created",
      entityType: "contacts",
      entityId: contact.id,
      contactId: contact.id,
    });

    return contact;
  }

  getContact(id: string): Contact | undefined {
    return this.get("contacts", id);
  }

  createBlogContentEvent(input: NewBlogContentEvent): BlogContentEvent {
    if (
      !input.visitorId &&
      !input.sessionId &&
      !input.contactId &&
      !input.leadId
    ) {
      throw new Error(
        "Blog content events require visitor, session, contact, or lead linkage",
      );
    }

    const event = this.create("blogContentEvents", {
      ...input,
      occurredAt: input.occurredAt ?? this.now(),
    });

    this.createAuditLog({
      actorId: "system",
      action: "blog_content_event.created",
      entityType: "blogContentEvents",
      entityId: event.id,
      contactId: event.contactId,
      metadata: {
        articleSlug: event.articleSlug,
        category: event.category,
        cta: event.cta,
        hasContactLinkage: Boolean(event.contactId),
        hasLeadLinkage: Boolean(event.leadId),
      },
    });

    return event;
  }

  ingestBlogContentEvent(input: NewBlogContentEvent): BlogContentEvent {
    return this.createBlogContentEvent(input);
  }

  getBlogContentEvent(id: string): BlogContentEvent | undefined {
    return this.get("blogContentEvents", id);
  }

  listBlogContentEventsByContact(contactId: string): BlogContentEvent[] {
    return this.list("blogContentEvents").filter((event) => {
      return event.contactId === contactId;
    });
  }

  listBlogTouchpointsForLead(leadId: string): BlogContentEvent[] {
    const lead = this.getLead(leadId);

    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    return this.list("blogContentEvents").filter((event) => {
      return event.leadId === lead.id || event.contactId === lead.contactId;
    });
  }

  getLeadProfileWithBlogTouchpoints(
    leadId: string,
  ): LeadProfileWithBlogTouchpoints {
    const lead = this.getLead(leadId);

    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const contact = this.getContact(lead.contactId);

    if (!contact) {
      throw new Error(`Contact not found: ${lead.contactId}`);
    }

    return {
      lead,
      contact,
      sourceAttributions: this.listSourceAttributionsByContact(contact.id),
      blogTouchpoints: this.listBlogTouchpointsForLead(lead.id),
    };
  }

  listBlogAttributionOutcomes(): BlogAttributionOutcome[] {
    return this.list("blogContentEvents").map((event) => {
      const leads = this.list("leads").filter((lead) => {
        return lead.id === event.leadId || lead.contactId === event.contactId;
      });
      const leadIds = leads.map((lead) => lead.id);
      const deals = this.list("deals").filter((deal) => {
        return (
          leadIds.includes(deal.leadId) || deal.contactId === event.contactId
        );
      });
      const dealIds = deals.map((deal) => deal.id);
      const contracts = this.list("contracts").filter((contract) => {
        return (
          dealIds.includes(contract.dealId) ||
          contract.contactId === event.contactId
        );
      });

      return {
        event,
        leadIds,
        dealIds,
        contractIds: contracts.map((contract) => contract.id),
        contractValueCents: contracts.reduce((total, contract) => {
          return total + contract.valueCents;
        }, 0),
        renewalContractIds: contracts
          .filter((contract) => {
            return (
              contract.status === "renewal_due" ||
              contract.status === "renewed"
            );
          })
          .map((contract) => contract.id),
      };
    });
  }

  createSourceAttribution(input: NewSourceAttribution): SourceAttribution {
    const firstTouchAt = input.firstTouchAt ?? this.now();
    const attribution = this.create("sourceAttributions", {
      ...input,
      firstTouchAt,
      latestChannel: input.latestChannel ?? input.channel,
      latestCampaign: input.latestCampaign ?? input.campaign,
      latestContent: input.latestContent ?? input.content,
      latestLandingPage: input.latestLandingPage ?? input.landingPage,
      latestReferrer: input.latestReferrer ?? input.referrer,
      latestUtmSource: input.latestUtmSource ?? input.utmSource,
      latestUtmMedium: input.latestUtmMedium ?? input.utmMedium,
      latestUtmCampaign: input.latestUtmCampaign ?? input.utmCampaign,
      latestUtmContent: input.latestUtmContent ?? input.utmContent,
      latestUtmTerm: input.latestUtmTerm ?? input.utmTerm,
      latestGclid: input.latestGclid ?? input.gclid,
      latestGbraid: input.latestGbraid ?? input.gbraid,
      latestWbraid: input.latestWbraid ?? input.wbraid,
      lastTouchAt: input.lastTouchAt ?? firstTouchAt,
    });

    this.createAuditLog({
      actorId: "system",
      action: "source_attribution.created",
      entityType: "sourceAttributions",
      entityId: attribution.id,
      contactId: attribution.contactId,
      metadata: {
        channel: attribution.channel,
      },
    });

    return attribution;
  }

  getSourceAttribution(id: string): SourceAttribution | undefined {
    return this.get("sourceAttributions", id);
  }

  listSourceAttributionsByContact(contactId: string): SourceAttribution[] {
    return this.listByContact("sourceAttributions", contactId);
  }

  updateSourceAttributionLatestTouch(
    id: string,
    input: NewSourceAttribution,
  ): SourceAttribution {
    const attribution = this.getSourceAttribution(id);

    if (!attribution) {
      throw new Error(`Source attribution not found: ${id}`);
    }

    const updated = this.update("sourceAttributions", id, {
      latestChannel: input.channel,
      latestCampaign: input.campaign,
      latestContent: input.content,
      latestLandingPage: input.landingPage,
      latestReferrer: input.referrer,
      latestUtmSource: input.utmSource,
      latestUtmMedium: input.utmMedium,
      latestUtmCampaign: input.utmCampaign,
      latestUtmContent: input.utmContent,
      latestUtmTerm: input.utmTerm,
      latestGclid: input.gclid,
      latestGbraid: input.gbraid,
      latestWbraid: input.wbraid,
      lastTouchAt: input.lastTouchAt ?? input.firstTouchAt ?? this.now(),
    });

    this.createAuditLog({
      actorId: "system",
      action: "source_attribution.latest_touch_updated",
      entityType: "sourceAttributions",
      entityId: updated.id,
      contactId: updated.contactId,
      metadata: {
        channel: updated.latestChannel ?? updated.channel,
      },
    });

    return updated;
  }

  createLead(input: NewLead): Lead {
    const lead = this.create("leads", {
      ...input,
      lifecycleStage: input.lifecycleStage ?? "lead",
      sourceAttributionIds: input.sourceAttributionIds ?? [],
    });

    this.updateContactLifecycleStage(lead.contactId, lead.lifecycleStage);

    this.createAuditLog({
      actorId: "system",
      action: "lead.created",
      entityType: "leads",
      entityId: lead.id,
      contactId: lead.contactId,
      metadata: {
        lifecycleStage: lead.lifecycleStage,
        ...buildMedicalGovernanceAuditMetadata({ content: lead.interest }),
      },
    });

    return lead;
  }

  getLead(id: string): Lead | undefined {
    return this.get("leads", id);
  }

  createDeal(input: NewDeal): Deal {
    const deal = this.create("deals", {
      ...input,
      stage: input.stage ?? "new_lead",
      sourceAttributionIds: input.sourceAttributionIds ?? [],
    });

    this.updateContactLifecycleStage(deal.contactId, "opportunity");

    this.createAuditLog({
      actorId: "system",
      action: "deal.created",
      entityType: "deals",
      entityId: deal.id,
      contactId: deal.contactId,
      metadata: {
        leadId: deal.leadId,
        stage: deal.stage,
        ...buildMedicalGovernanceAuditMetadata({ content: deal.title }),
      },
    });

    return deal;
  }

  getDeal(id: string): Deal | undefined {
    return this.get("deals", id);
  }

  listDeals(): Deal[] {
    return this.list("deals");
  }

  updateDealStage(
    id: string,
    to: Deal["stage"],
    options: UpdateDealStageOptions = {},
  ): Deal {
    const deal = this.getDeal(id);

    if (!deal) {
      throw new Error(`Deal not found: ${id}`);
    }

    const lossReason = options.lossReason?.trim();

    if (to === "lost" && !lossReason) {
      throw new Error("Moving a deal to lost requires a loss reason");
    }

    if (deal.stage === to) {
      return deal;
    }

    const updated = this.update("deals", id, {
      stage: to,
      lossReason: to === "lost" ? lossReason : undefined,
      lostAt: to === "lost" ? this.now() : undefined,
    });

    this.createAuditLog({
      actorId: options.actorId ?? "system",
      action: "deal_stage.changed",
      entityType: "deals",
      entityId: updated.id,
      contactId: updated.contactId,
      from: deal.stage,
      to,
      metadata: lossReason
        ? {
            lossReason,
          }
        : undefined,
    });

    return updated;
  }

  createContract(input: NewContract): Contract {
    const contract = this.create("contracts", {
      ...input,
      status: input.status ?? "active",
      sourceAttributionIds: input.sourceAttributionIds ?? [],
    });

    this.updateContactLifecycleStage(contract.contactId, "active_care");

    this.createAuditLog({
      actorId: "system",
      action: "contract.created",
      entityType: "contracts",
      entityId: contract.id,
      contactId: contract.contactId,
      metadata: {
        dealId: contract.dealId,
        planType: contract.planType,
        valueCents: contract.valueCents,
      },
    });

    return contract;
  }

  getContract(id: string): Contract | undefined {
    return this.get("contracts", id);
  }

  listContracts(): Contract[] {
    return this.list("contracts");
  }

  updateContractStatus(id: string, to: Contract["status"]): Contract {
    const contract = this.getContract(id);

    if (!contract) {
      throw new Error(`Contract not found: ${id}`);
    }

    if (contract.status === to) {
      return contract;
    }

    const updated = this.update("contracts", id, { status: to });

    this.createAuditLog({
      actorId: "system",
      action: "contract_status.changed",
      entityType: "contracts",
      entityId: updated.id,
      contactId: updated.contactId,
      from: contract.status,
      to,
    });

    return updated;
  }

  createTask(input: NewTask): Task {
    const task = this.create("tasks", {
      ...input,
      status: input.status ?? "open",
    });

    this.createAuditLog({
      actorId: "system",
      action: "task.created",
      entityType: "tasks",
      entityId: task.id,
      contactId: task.contactId,
    });

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.get("tasks", id);
  }

  createConsent(input: NewConsent): Consent {
    const status = input.status ?? "granted";
    const decidedAt = input.decidedAt ?? this.now();
    const consent = this.create("consents", {
      ...input,
      source: input.source ?? "manual",
      decidedAt,
      status,
      grantedAt:
        status === "granted" ? input.grantedAt ?? decidedAt : input.grantedAt,
      revokedAt:
        status === "revoked" ? input.revokedAt ?? decidedAt : input.revokedAt,
    });

    this.createAuditLog({
      actorId: "system",
      action: "consent.created",
      entityType: "consents",
      entityId: consent.id,
      contactId: consent.contactId,
      metadata: {
        purpose: consent.purpose,
        source: consent.source,
        status: consent.status,
      },
    });

    return consent;
  }

  getConsent(id: string): Consent | undefined {
    return this.get("consents", id);
  }

  listConsentsByContact(contactId: string): Consent[] {
    return this.listByContact("consents", contactId);
  }

  updateConsentStatus(
    id: string,
    to: ConsentStatus,
    options: ConsentStatusChangeOptions = {},
  ): Consent {
    const consent = this.getConsent(id);

    if (!consent) {
      throw new Error(`Consent not found: ${id}`);
    }

    if (consent.status === to) {
      return consent;
    }

    const decidedAt = options.decidedAt ?? this.now();
    const updated = this.update("consents", id, {
      status: to,
      source: options.source ?? consent.source,
      decidedAt,
      grantedAt: to === "granted" ? decidedAt : consent.grantedAt,
      revokedAt: to === "revoked" ? decidedAt : consent.revokedAt,
    });

    this.createAuditLog({
      actorId: options.actorId ?? "system",
      action: "consent.status_changed",
      entityType: "consents",
      entityId: updated.id,
      contactId: updated.contactId,
      from: consent.status,
      to,
      metadata: {
        purpose: updated.purpose,
        source: updated.source,
      },
    });

    return updated;
  }

  markMarketingOptOut(
    contactId: string,
    options: CommunicationPreferenceChangeOptions = {},
  ): Contact {
    return this.updateCommunicationPreferences(
      contactId,
      {
        marketingOptOut: true,
        marketingOptedOutAt: options.changedAt ?? this.now(),
      },
      "marketingOptOut",
      options,
    );
  }

  setOperationalCommunicationPermission(
    contactId: string,
    allowed: boolean,
    options: CommunicationPreferenceChangeOptions = {},
  ): Contact {
    return this.updateCommunicationPreferences(
      contactId,
      {
        operationalCommunicationAllowed: allowed,
        operationalCommunicationUpdatedAt: options.changedAt ?? this.now(),
      },
      "operationalCommunicationAllowed",
      options,
    );
  }

  markDoNotContact(
    contactId: string,
    options: CommunicationPreferenceChangeOptions = {},
  ): Contact {
    const changedAt = options.changedAt ?? this.now();
    const contact = this.updateCommunicationPreferences(
      contactId,
      {
        doNotContact: true,
        doNotContactAt: changedAt,
      },
      "doNotContact",
      {
        ...options,
        changedAt,
      },
    );

    if (contact.lifecycleStage === "do_not_contact") {
      return contact;
    }

    return this.updateContactLifecycleStage(contactId, "do_not_contact");
  }

  canSendMarketingCommunication(contactId: string): boolean {
    const contact = this.getContact(contactId);

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    if (
      contact.communicationPreferences.marketingOptOut ||
      contact.communicationPreferences.doNotContact
    ) {
      return false;
    }

    const latestMarketingConsent = this.listConsentsByContact(contactId)
      .filter((consent) => consent.purpose === "marketing")
      .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))[0];

    return latestMarketingConsent?.status === "granted";
  }

  canSendOperationalCommunication(contactId: string): boolean {
    const contact = this.getContact(contactId);

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return (
      contact.communicationPreferences.operationalCommunicationAllowed &&
      !contact.communicationPreferences.doNotContact
    );
  }

  createAuditLog(input: NewAuditLog): AuditLog {
    const medicalGovernanceMetadata = buildMedicalGovernanceAuditMetadata({
      metadata: input.metadata,
    });

    return this.create("auditLogs", {
      ...input,
      metadata:
        input.metadata || Object.keys(medicalGovernanceMetadata).length > 0
          ? {
              ...input.metadata,
              ...medicalGovernanceMetadata,
            }
          : undefined,
    });
  }

  getAuditLog(id: string): AuditLog | undefined {
    return this.get("auditLogs", id);
  }

  listAuditLogs(): AuditLog[] {
    return this.list("auditLogs");
  }

  listByContact<TCollection extends CrmCollectionName>(
    collection: TCollection,
    contactId: string,
  ): CrmEntitiesByCollection[TCollection][] {
    return this.list(collection).filter((entity) => {
      return "contactId" in entity && entity.contactId === contactId;
    });
  }

  private create<TCollection extends CrmCollectionName>(
    collection: TCollection,
    input: CreateInputByCollection[TCollection],
  ): CrmEntitiesByCollection[TCollection] {
    const timestamp = this.now();
    const entity = {
      ...input,
      id: this.nextId(collection),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as CrmEntitiesByCollection[TCollection];

    this.table(collection).set(entity.id, entity);

    return clone(entity);
  }

  private get<TCollection extends CrmCollectionName>(
    collection: TCollection,
    id: string,
  ): CrmEntitiesByCollection[TCollection] | undefined {
    const entity = this.table(collection).get(id);

    return entity ? clone(entity) : undefined;
  }

  private list<TCollection extends CrmCollectionName>(
    collection: TCollection,
  ): CrmEntitiesByCollection[TCollection][] {
    return Array.from(this.table(collection).values()).map((entity) =>
      clone(entity),
    );
  }

  private update<TCollection extends CrmCollectionName>(
    collection: TCollection,
    id: string,
    input: UpdateInput<CrmEntitiesByCollection[TCollection]>,
  ): CrmEntitiesByCollection[TCollection] {
    const table = this.table(collection);
    const current = table.get(id);

    if (!current) {
      throw new Error(`CRM entity not found: ${collection}/${id}`);
    }

    const updated = {
      ...current,
      ...input,
      updatedAt: this.now(),
    } as CrmEntitiesByCollection[TCollection];

    table.set(id, updated);

    return clone(updated);
  }

  updateContactLifecycleStage(
    contactId: string,
    to: Contact["lifecycleStage"],
  ): Contact {
    const contact = this.getContact(contactId);

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    if (contact.lifecycleStage === to) {
      return contact;
    }

    const updated = this.update("contacts", contactId, {
      lifecycleStage: to,
    });

    this.createAuditLog({
      actorId: "system",
      action: "lifecycle_stage.changed",
      entityType: "contacts",
      entityId: updated.id,
      contactId: updated.id,
      from: contact.lifecycleStage,
      to,
    });

    return updated;
  }

  private updateCommunicationPreferences(
    contactId: string,
    changes: Partial<CommunicationPreferences>,
    preference: keyof CommunicationPreferences,
    options: CommunicationPreferenceChangeOptions,
  ): Contact {
    const contact = this.getContact(contactId);

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const before = contact.communicationPreferences[preference];
    const updated = this.update("contacts", contactId, {
      communicationPreferences: {
        ...contact.communicationPreferences,
        ...changes,
      },
    });

    this.createAuditLog({
      actorId: options.actorId ?? "system",
      action: "communication_preferences.changed",
      entityType: "contacts",
      entityId: updated.id,
      contactId: updated.id,
      from: String(before),
      to: String(updated.communicationPreferences[preference]),
      metadata: {
        preference,
        source: options.source ?? "manual",
      },
    });

    return updated;
  }

  private table<TCollection extends CrmCollectionName>(collection: TCollection) {
    const table = this.tables.get(collection);

    if (!table) {
      throw new Error(`Unknown CRM collection: ${collection}`);
    }

    return table as Map<string, CrmEntitiesByCollection[TCollection]>;
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private nextId(collection: CrmCollectionName): string {
    if (this.idFactory) {
      return this.idFactory(collection);
    }

    const next = (this.counters.get(collection) ?? 0) + 1;
    this.counters.set(collection, next);

    return `${collection}_${next}`;
  }
}

export const createInMemoryCrmRepository = (options?: RepositoryOptions) =>
  new InMemoryCrmRepository(options);
