import type {
  AuditLog,
  Contact,
  Contract,
  CrmCollectionName,
  CrmEntitiesByCollection,
  CrmEntity,
  Deal,
  Lead,
  NewAuditLog,
  NewConsent,
  NewContact,
  NewContract,
  NewDeal,
  NewLead,
  NewSourceAttribution,
  NewTask,
  SourceAttribution,
  Task,
  Consent,
} from "./types";

type CreateInputByCollection = {
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

const collections: CrmCollectionName[] = [
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
      },
    });

    return deal;
  }

  getDeal(id: string): Deal | undefined {
    return this.get("deals", id);
  }

  updateDealStage(id: string, to: Deal["stage"]): Deal {
    const deal = this.getDeal(id);

    if (!deal) {
      throw new Error(`Deal not found: ${id}`);
    }

    if (deal.stage === to) {
      return deal;
    }

    const updated = this.update("deals", id, { stage: to });

    this.createAuditLog({
      actorId: "system",
      action: "deal_stage.changed",
      entityType: "deals",
      entityId: updated.id,
      contactId: updated.contactId,
      from: deal.stage,
      to,
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
    const consent = this.create("consents", {
      ...input,
      status: input.status ?? "granted",
    });

    this.createAuditLog({
      actorId: "system",
      action: "consent.created",
      entityType: "consents",
      entityId: consent.id,
      contactId: consent.contactId,
      metadata: {
        purpose: consent.purpose,
        status: consent.status,
      },
    });

    return consent;
  }

  getConsent(id: string): Consent | undefined {
    return this.get("consents", id);
  }

  createAuditLog(input: NewAuditLog): AuditLog {
    return this.create("auditLogs", input);
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
