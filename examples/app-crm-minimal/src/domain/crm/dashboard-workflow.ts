import type { InMemoryCrmRepository } from "./in-memory-crm-repository";
import { listPipelineDeals } from "./pipeline-workflow";
import type {
  AttributionChannel,
  Contract,
  ContractPlanType,
  ContractStatus,
  DealStage,
  SourceAttribution,
} from "./types";

export interface FunnelDashboardRow {
  stage: DealStage;
  label: string;
  count: number;
  valueCents: number;
}

export interface RevenueDashboardRow {
  planType: ContractPlanType;
  label: string;
  count: number;
  revenueCents: number;
}

export interface AttributionDashboardRow {
  channel: AttributionChannel;
  label: string;
  count: number;
  revenueCents: number;
}

export interface RenewalDashboardRow {
  contactName: string;
  planLabel: string;
  renewalDueAt: string;
  valueCents: number;
}

export interface CrmDashboardSnapshot {
  funnelRows: FunnelDashboardRow[];
  revenueRows: RevenueDashboardRow[];
  attributionRows: AttributionDashboardRow[];
  renewalRows: RenewalDashboardRow[];
  metrics: {
    funnelDeals: number;
    pipelineValueCents: number;
    activeRevenueCents: number;
    renewalDueCount: number;
  };
}

export const contractPlanLabels: Array<{
  planType: ContractPlanType;
  label: string;
}> = [
  { planType: "monthly", label: "Mensal" },
  { planType: "semiannual", label: "Semestral" },
  { planType: "annual", label: "Anual" },
];

export const contractPlanLabelByType = Object.fromEntries(
  contractPlanLabels.map((item) => [item.planType, item.label]),
) as Record<ContractPlanType, string>;

export const attributionChannelLabels: Record<AttributionChannel, string> = {
  blog: "Blog",
  ads: "Ads",
  referral: "Indicação",
  organic: "Orgânico",
  whatsapp_dm: "WhatsApp/DM",
  instagram: "Instagram",
  direct: "Direto",
  other: "Outro",
};

const revenueEligibleContractStatuses = new Set<ContractStatus>([
  "active",
  "renewal_due",
  "renewed",
]);

export const buildCrmDashboardSnapshot = (
  repository: InMemoryCrmRepository,
): CrmDashboardSnapshot => {
  const pipelineGroups = listPipelineDeals(repository);
  const contracts = repository.listContracts();
  const revenueContracts = contracts.filter(isRevenueEligibleContract);
  const funnelRows = pipelineGroups
    .filter((group) => group.deals.length > 0)
    .map((group) => ({
      stage: group.stage,
      label: group.label,
      count: group.deals.length,
      valueCents: group.deals.reduce((total, deal) => {
        return total + (deal.valueCents ?? 0);
      }, 0),
    }));
  const revenueRows = contractPlanLabels.map((item) => {
    const matchingContracts = revenueContracts.filter((contract) => {
      return contract.planType === item.planType;
    });

    return {
      ...item,
      count: matchingContracts.length,
      revenueCents: sumContractValueCents(matchingContracts),
    };
  });
  const attributionRows = buildAttributionRows(repository, revenueContracts);
  const renewalRows = revenueContracts
    .filter((contract) => {
      return contract.status === "renewal_due";
    })
    .map((contract) => ({
      contactName:
        repository.getContact(contract.contactId)?.fullName ??
        "Contato sem nome",
      planLabel: contractPlanLabelByType[contract.planType],
      renewalDueAt: contract.renewalDueAt,
      valueCents: contract.valueCents,
    }))
    .sort((left, right) => left.renewalDueAt.localeCompare(right.renewalDueAt));

  return {
    funnelRows,
    revenueRows,
    attributionRows,
    renewalRows,
    metrics: {
      funnelDeals: pipelineGroups.reduce((total, group) => {
        return total + group.deals.length;
      }, 0),
      pipelineValueCents: pipelineGroups.reduce((total, group) => {
        return (
          total +
          group.deals.reduce((groupTotal, deal) => {
            return groupTotal + (deal.valueCents ?? 0);
          }, 0)
        );
      }, 0),
      activeRevenueCents: sumContractValueCents(revenueContracts),
      renewalDueCount: renewalRows.length,
    },
  };
};

const buildAttributionRows = (
  repository: InMemoryCrmRepository,
  contracts: Contract[],
): AttributionDashboardRow[] => {
  const rowsByChannel = new Map<AttributionChannel, AttributionDashboardRow>();

  for (const contract of contracts) {
    const attribution = getPrimaryAttribution(repository, contract);
    const channel = attribution?.channel ?? "other";
    const current = rowsByChannel.get(channel) ?? {
      channel,
      label: attributionChannelLabels[channel],
      count: 0,
      revenueCents: 0,
    };

    rowsByChannel.set(channel, {
      ...current,
      count: current.count + 1,
      revenueCents: current.revenueCents + contract.valueCents,
    });
  }

  return Array.from(rowsByChannel.values()).sort((left, right) => {
    return right.revenueCents - left.revenueCents;
  });
};

const getPrimaryAttribution = (
  repository: InMemoryCrmRepository,
  contract: Contract,
): SourceAttribution | undefined => {
  return contract.sourceAttributionIds
    .map((id) => repository.getSourceAttribution(id))
    .find((attribution): attribution is SourceAttribution => {
      return Boolean(attribution);
    });
};

const isRevenueEligibleContract = (contract: Contract): boolean => {
  return revenueEligibleContractStatuses.has(contract.status);
};

const sumContractValueCents = (contracts: Contract[]): number => {
  return contracts.reduce((total, contract) => {
    return total + contract.valueCents;
  }, 0);
};
