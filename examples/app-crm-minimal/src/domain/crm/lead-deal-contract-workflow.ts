import type { InMemoryCrmRepository } from "./in-memory-crm-repository";
import type {
  Contact,
  Contract,
  ContractPlanType,
  Deal,
  Lead,
  NewContact,
  NewContract,
  NewDeal,
  NewLead,
  NewSourceAttribution,
  SourceAttribution,
} from "./types";

interface CreateLeadInput {
  contact: NewContact;
  lead?: Omit<NewLead, "contactId" | "sourceAttributionIds">;
  attribution: Omit<NewSourceAttribution, "contactId">;
}

interface LeadWithAttribution {
  contact: Contact;
  lead: Lead;
  attribution: SourceAttribution;
}

interface RecordAttributionTouchInput {
  contactId: string;
  attribution: Omit<NewSourceAttribution, "contactId">;
  internalHostnames?: string[];
}

export interface ContractRenewalSchedule {
  endDate: string;
  renewalDueAt: string;
  taskDueAt: string;
  taskTitle: string;
}

export const createLeadWithAttribution = (
  repository: InMemoryCrmRepository,
  input: CreateLeadInput,
): LeadWithAttribution => {
  const contact = repository.createContact(input.contact);
  const attribution = repository.createSourceAttribution({
    ...input.attribution,
    contactId: contact.id,
  });
  const lead = repository.createLead({
    lifecycleStage: "lead",
    ...input.lead,
    contactId: contact.id,
    sourceAttributionIds: [attribution.id],
  });

  return {
    contact,
    lead,
    attribution,
  };
};

export const recordAttributionTouch = (
  repository: InMemoryCrmRepository,
  input: RecordAttributionTouchInput,
): SourceAttribution => {
  const [firstAttribution] = repository
    .listSourceAttributionsByContact(input.contactId)
    .sort((left, right) => left.firstTouchAt.localeCompare(right.firstTouchAt));

  if (!firstAttribution) {
    return repository.createSourceAttribution({
      ...input.attribution,
      contactId: input.contactId,
    });
  }

  if (isInternalNavigationTouch(input.attribution, input.internalHostnames)) {
    return firstAttribution;
  }

  return repository.updateSourceAttributionLatestTouch(firstAttribution.id, {
    ...input.attribution,
    contactId: input.contactId,
  });
};

export const moveLeadToDeal = (
  repository: InMemoryCrmRepository,
  leadId: string,
  input: Omit<NewDeal, "contactId" | "leadId" | "sourceAttributionIds">,
): Deal => {
  const lead = repository.getLead(leadId);

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  return repository.createDeal({
    stage: "medical_review_pending",
    ...input,
    contactId: lead.contactId,
    leadId: lead.id,
    sourceAttributionIds: lead.sourceAttributionIds,
  });
};

export const buildContractRenewalSchedule = (
  planType: ContractPlanType,
  startDate: string,
): ContractRenewalSchedule => {
  const endDate = addMonths(startDate, planDurationMonths[planType]);

  if (planType === "monthly") {
    return {
      endDate,
      renewalDueAt: endDate,
      taskDueAt: atOperationalHour(addDays(startDate, 14)),
      taskTitle: "Check-in de retenção do contrato mensal",
    };
  }

  if (planType === "semiannual") {
    return {
      endDate,
      renewalDueAt: endDate,
      taskDueAt: atOperationalHour(addMonths(startDate, 4)),
      taskTitle: "Preparar renovação do contrato semestral antes do mês 5",
    };
  }

  return {
    endDate,
    renewalDueAt: endDate,
    taskDueAt: atOperationalHour(addMonths(startDate, 10)),
    taskTitle: "Preparar renovação do contrato anual entre os meses 10 e 11",
  };
};

export const createContractFromDeal = (
  repository: InMemoryCrmRepository,
  dealId: string,
  input: Omit<
    NewContract,
    | "contactId"
    | "dealId"
    | "sourceAttributionIds"
    | "endDate"
    | "renewalDueAt"
  >,
): Contract => {
  const deal = repository.getDeal(dealId);

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  if (!["won", "contract_active"].includes(deal.stage)) {
    throw new Error(
      `Contract can only be created from a won or active deal: ${dealId}`,
    );
  }

  const renewalSchedule = buildContractRenewalSchedule(
    input.planType,
    input.startDate,
  );
  const contract = repository.createContract({
    status: "active",
    ...input,
    endDate: renewalSchedule.endDate,
    renewalDueAt: renewalSchedule.renewalDueAt,
    contactId: deal.contactId,
    dealId: deal.id,
    sourceAttributionIds: deal.sourceAttributionIds,
  });

  repository.updateDealStage(deal.id, "contract_active");
  repository.createTask({
    contactId: deal.contactId,
    dealId: deal.id,
    contractId: contract.id,
    title: renewalSchedule.taskTitle,
    dueAt: renewalSchedule.taskDueAt,
  });

  return contract;
};

export const markContractsDueForRenewal = (
  repository: InMemoryCrmRepository,
  asOfDate: string,
): Contract[] => {
  return repository
    .listContracts()
    .filter((contract) => {
      return contract.status === "active" && contract.renewalDueAt <= asOfDate;
    })
    .map((contract) => {
      const updated = repository.updateContractStatus(
        contract.id,
        "renewal_due",
      );

      repository.updateDealStage(contract.dealId, "renewal_due");
      repository.updateContactLifecycleStage(contract.contactId, "renewal_due");

      return updated;
    });
};

const planDurationMonths: Record<ContractPlanType, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

const parseDateOnly = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Expected YYYY-MM-DD date: ${date}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const value = parseDateOnly(date);
  value.setUTCDate(value.getUTCDate() + days);

  return formatDateOnly(value);
};

const addMonths = (date: string, months: number): string => {
  const value = parseDateOnly(date);
  value.setUTCMonth(value.getUTCMonth() + months);

  return formatDateOnly(value);
};

const atOperationalHour = (date: string): string =>
  `${date}T12:00:00.000Z`;

const defaultInternalHostnames = [
  "luzperformance.com.br",
  "www.luzperformance.com.br",
  "luzperformance.com",
  "www.luzperformance.com",
  "localhost",
];

const isInternalNavigationTouch = (
  attribution: Omit<NewSourceAttribution, "contactId">,
  internalHostnames = defaultInternalHostnames,
): boolean => {
  if (hasExternalAttributionSignal(attribution)) {
    return false;
  }

  return (
    isInternalUrl(attribution.landingPage, internalHostnames) &&
    isInternalUrl(attribution.referrer, internalHostnames)
  );
};

const hasExternalAttributionSignal = (
  attribution: Omit<NewSourceAttribution, "contactId">,
): boolean =>
  Boolean(
    attribution.campaign ||
      attribution.content ||
      attribution.utmSource ||
      attribution.utmMedium ||
      attribution.utmCampaign ||
      attribution.utmContent ||
      attribution.utmTerm ||
      attribution.gclid ||
      attribution.gbraid ||
      attribution.wbraid,
  );

const isInternalUrl = (
  value: string | undefined,
  internalHostnames: string[],
): boolean => {
  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  try {
    const { hostname } = new URL(value);

    return internalHostnames.some(
      (internalHostname) =>
        hostname === internalHostname ||
        hostname.endsWith(`.${internalHostname}`),
    );
  } catch {
    return false;
  }
};
