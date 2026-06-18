import { useMemo, useState, type CSSProperties } from "react";

import { Link } from "react-router";

import {
  ArrowRightOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";

import {
  createContractFromDeal,
  createInMemoryCrmRepository,
  createLeadWithAttribution,
  dealStageLabels,
  dealStages,
  evaluateMedicalGovernancePolicy,
  listPipelineDeals,
  markContractsDueForRenewal,
  moveDealThroughPipeline,
  moveLeadToDeal,
  type AttributionChannel,
  type ContractPlanType,
  type DealStage,
  type InMemoryCrmRepository,
} from "@/domain/crm";

import { crmSections, getCrmSection, type CrmSectionKey } from "./sections";

const { Paragraph, Text, Title } = Typography;

const shellBackground: CSSProperties = {
  minHeight: "calc(100vh - 64px)",
  margin: "-32px",
  padding: "40px",
  background:
    "radial-gradient(circle at top left, rgba(201, 164, 74, 0.16), transparent 30%), #0d1f33",
};

const heroCard: CSSProperties = {
  border: "1px solid rgba(201, 164, 74, 0.3)",
  borderRadius: 24,
  background:
    "linear-gradient(135deg, rgba(20, 42, 66, 0.96), rgba(13, 31, 51, 0.96))",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.32)",
};

const sectionCard: CSSProperties = {
  height: "100%",
  border: "1px solid rgba(201, 164, 74, 0.24)",
  borderRadius: 20,
  background: "rgba(20, 42, 66, 0.92)",
};

const pipelineColumn: CSSProperties = {
  height: "100%",
  minHeight: 260,
  border: "1px solid rgba(201, 164, 74, 0.2)",
  borderRadius: 18,
  background: "rgba(13, 31, 51, 0.74)",
};

const metricCard: CSSProperties = {
  height: "100%",
  border: "1px solid rgba(201, 164, 74, 0.22)",
  borderRadius: 18,
  background: "rgba(13, 31, 51, 0.78)",
};

const dashboardPanel: CSSProperties = {
  height: "100%",
  border: "1px solid rgba(201, 164, 74, 0.24)",
  borderRadius: 20,
  background: "rgba(20, 42, 66, 0.92)",
};

const buildDemoPipelineRepository = () => {
  const repository = createInMemoryCrmRepository({
    clock: () => new Date("2026-06-18T12:00:00.000Z"),
  });

  seedDeal(repository, {
    fullName: "Lead Blog — hipertrofia segura",
    channel: "blog",
    campaign: "artigo-hipertrofia-segura",
    title: "Avaliação inicial + acompanhamento semestral",
    stage: "medical_review_pending",
    valueCents: 600000,
    interest:
      "Lead relatou sintomas e exames; exige revisão médica antes de orientar ou exportar.",
  });
  seedDeal(repository, {
    fullName: "Lead Ads — performance responsável",
    channel: "ads",
    campaign: "avaliacao-performance-responsavel",
    title: "Acompanhamento anual LuzPerformance",
    stage: "proposal_sent",
    valueCents: 1200000,
  });
  seedDeal(repository, {
    fullName: "Indicação — renovação operacional",
    channel: "referral",
    campaign: "indicacao-paciente-ativo",
    title: "Renovação semestral",
    stage: "renewal_due",
    valueCents: 600000,
  });

  return repository;
};

const seedDeal = (
  repository: InMemoryCrmRepository,
  input: {
    fullName: string;
    channel: "blog" | "ads" | "referral";
    campaign: string;
    title: string;
    stage: DealStage;
    valueCents: number;
    interest?: string;
  },
) => {
  const { lead } = createLeadWithAttribution(repository, {
    contact: {
      fullName: input.fullName,
    },
    attribution: {
      channel: input.channel,
      campaign: input.campaign,
    },
    lead: {
      lifecycleStage: "sql",
      interest:
        input.interest ??
        "Consulta comercial com fronteira médica e redução de danos",
    },
  });

  return moveLeadToDeal(repository, lead.id, {
    title: input.title,
    stage: input.stage,
    valueCents: input.valueCents,
  });
};

const buildDemoDashboardRepository = () => {
  const repository = createInMemoryCrmRepository({
    clock: () => new Date("2026-06-18T12:00:00.000Z"),
  });

  seedDashboardContract(repository, {
    fullName: "Lead Blog — contrato semestral",
    channel: "blog",
    campaign: "artigo-hipertrofia-segura",
    articleSlug: "hipertrofia-com-seguranca",
    articleTitle: "Hipertrofia com segurança médica",
    cta: "avaliacao-medica",
    dealTitle: "Contrato semestral Blog",
    planType: "semiannual",
    startDate: "2026-06-20",
    valueCents: 600000,
    markRenewalAsOf: "2026-12-20",
  });
  seedDashboardContract(repository, {
    fullName: "Lead Ads — contrato anual",
    channel: "ads",
    campaign: "google-performance-responsavel",
    dealTitle: "Contrato anual Ads",
    planType: "annual",
    startDate: "2026-07-01",
    valueCents: 1200000,
  });
  seedDashboardContract(repository, {
    fullName: "Indicação — contrato mensal",
    channel: "referral",
    campaign: "indicacao-paciente-ativo",
    dealTitle: "Contrato mensal indicação",
    planType: "monthly",
    startDate: "2026-08-01",
    valueCents: 100000,
    markRenewalAsOf: "2026-09-01",
  });
  seedDeal(repository, {
    fullName: "Lead WhatsApp — proposta em aberto",
    channel: "ads",
    campaign: "remarketing-whatsapp",
    title: "Proposta semestral em negociação",
    stage: "proposal_sent",
    valueCents: 600000,
  });

  return repository;
};

const seedDashboardContract = (
  repository: InMemoryCrmRepository,
  input: {
    fullName: string;
    channel: "blog" | "ads" | "referral";
    campaign: string;
    articleSlug?: string;
    articleTitle?: string;
    cta?: string;
    dealTitle: string;
    planType: ContractPlanType;
    startDate: string;
    valueCents: number;
    markRenewalAsOf?: string;
  },
) => {
  const { contact, lead } = createLeadWithAttribution(repository, {
    contact: {
      fullName: input.fullName,
    },
    attribution: {
      channel: input.channel,
      campaign: input.campaign,
    },
    lead: {
      lifecycleStage: "sql",
      interest: "Acompanhamento médico-operacional com redução de danos",
    },
  });

  if (input.articleSlug) {
    repository.ingestBlogContentEvent({
      articleSlug: input.articleSlug,
      articleTitle: input.articleTitle,
      category: "performance",
      topic: "redução de danos",
      cta: input.cta ?? "avaliacao-medica",
      contactId: contact.id,
      leadId: lead.id,
      sessionId: `${lead.id}-blog-session`,
    });
  }

  const deal = moveLeadToDeal(repository, lead.id, {
    title: input.dealTitle,
    stage: "won",
    valueCents: input.valueCents,
  });
  const contract = createContractFromDeal(repository, deal.id, {
    planType: input.planType,
    startDate: input.startDate,
    valueCents: input.valueCents,
  });

  if (input.markRenewalAsOf) {
    markContractsDueForRenewal(repository, input.markRenewalAsOf);
  }

  return contract;
};

type FunnelDashboardRow = {
  label: string;
  count: number;
  valueCents: number;
};

type RevenueDashboardRow = {
  planType: ContractPlanType;
  label: string;
  count: number;
  revenueCents: number;
};

type AttributionDashboardRow = {
  channel: AttributionChannel;
  count: number;
  revenueCents: number;
};

type RenewalDashboardRow = {
  contactName: string;
  planLabel: string;
  renewalDueAt: string;
  valueCents: number;
};

const buildDashboardSnapshot = (repository: InMemoryCrmRepository) => {
  const pipelineGroups = listPipelineDeals(repository);
  const contracts = repository.listContracts();
  const funnelRows: FunnelDashboardRow[] = pipelineGroups
    .filter((group) => group.deals.length > 0)
    .map((group) => ({
      label: group.label,
      count: group.deals.length,
      valueCents: group.deals.reduce((total, deal) => {
        return total + (deal.valueCents ?? 0);
      }, 0),
    }));
  const revenueRows = contractPlanLabels.map((item) => {
    const matchingContracts = contracts.filter((contract) => {
      return contract.planType === item.planType;
    });

    return {
      ...item,
      count: matchingContracts.length,
      revenueCents: matchingContracts.reduce((total, contract) => {
        return total + contract.valueCents;
      }, 0),
    };
  });
  const attributionRows = buildAttributionRows(repository);
  const renewalRows = contracts
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
  const activeRevenueCents = contracts.reduce((total, contract) => {
    return total + contract.valueCents;
  }, 0);

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
      activeRevenueCents,
      renewalDueCount: renewalRows.length,
    },
  };
};

const buildAttributionRows = (
  repository: InMemoryCrmRepository,
): AttributionDashboardRow[] => {
  const rowsByChannel = new Map<AttributionChannel, AttributionDashboardRow>();

  for (const contract of repository.listContracts()) {
    const attribution = contract.sourceAttributionIds
      .map((id) => repository.getSourceAttribution(id))
      .find(Boolean);
    const channel = attribution?.channel ?? "other";
    const current = rowsByChannel.get(channel) ?? {
      channel,
      count: 0,
      revenueCents: 0,
    };

    rowsByChannel.set(channel, {
      channel,
      count: current.count + 1,
      revenueCents: current.revenueCents + contract.valueCents,
    });
  }

  return Array.from(rowsByChannel.values()).sort((left, right) => {
    return right.revenueCents - left.revenueCents;
  });
};

const contractPlanLabels: Array<{
  planType: ContractPlanType;
  label: string;
}> = [
  { planType: "monthly", label: "Mensal" },
  { planType: "semiannual", label: "Semestral" },
  { planType: "annual", label: "Anual" },
];

const contractPlanLabelByType = Object.fromEntries(
  contractPlanLabels.map((item) => [item.planType, item.label]),
) as Record<ContractPlanType, string>;

const attributionChannelLabels: Record<AttributionChannel, string> = {
  blog: "Blog",
  ads: "Ads",
  referral: "Indicação",
  organic: "Orgânico",
  whatsapp_dm: "WhatsApp/DM",
  instagram: "Instagram",
  direct: "Direto",
  other: "Outro",
};

const formatCurrency = (valueCents: number) =>
  `R$ ${(valueCents / 100).toLocaleString("pt-BR")}`;

export const CrmDashboardPage = () => {
  const [repository] = useState(buildDemoDashboardRepository);
  const dashboard = useMemo(
    () => buildDashboardSnapshot(repository),
    [repository],
  );

  return (
    <main style={shellBackground}>
      <Card style={heroCard} styles={{ body: { padding: 32 } }}>
        <Space direction="vertical" size={18} style={{ maxWidth: 920 }}>
          <Tag color="gold" style={{ width: "fit-content" }}>
            CRM médico-operacional LuzPerformance
          </Tag>
          <Title
            level={1}
            style={{ color: "#ffffff", fontFamily: "Orbitron, sans-serif" }}
          >
            Shell interno para leads, contratos, atribuição e renovação
          </Title>
          <Paragraph style={{ color: "#e0e0e0", fontSize: 16, margin: 0 }}>
            Este CRM organiza a jornada comercial completa sem virar
            prontuário: captura, qualificação, pipeline, contratos mensal,
            semestral e anual, follow-ups, Blog/Ads attribution, dashboards e
            compliance LGPD.
          </Paragraph>
          <Text style={{ color: "#a0a0a0" }}>
            Fronteira permanente: nada aqui automatiza diagnóstico, prescrição,
            dose ou conduta médica individualizada.
          </Text>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <DashboardMetricCard
          label="Deals no funil"
          value={String(dashboard.metrics.funnelDeals)}
          detail="Visão HubSpot-like por estágio"
        />
        <DashboardMetricCard
          label="Pipeline ponderável"
          value={formatCurrency(dashboard.metrics.pipelineValueCents)}
          detail="Receita potencial e contratada"
        />
        <DashboardMetricCard
          label="Receita em contratos"
          value={formatCurrency(dashboard.metrics.activeRevenueCents)}
          detail="Mensal, semestral e anual"
        />
        <DashboardMetricCard
          label="Renovações próximas"
          value={String(dashboard.metrics.renewalDueCount)}
          detail="Contratos em janela de renovação"
        />
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} xl={12}>
          <Card style={dashboardPanel} styles={{ body: { padding: 24 } }}>
            <Title level={3} style={{ color: "#ffffff", marginTop: 0 }}>
              Funil HubSpot-like
            </Title>
            <Paragraph style={{ color: "#a0a0a0" }}>
              Conversão por etapa comercial sem inferir conduta clínica.
            </Paragraph>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {dashboard.funnelRows.map((row) => (
                <DashboardListRow
                  key={row.label}
                  label={row.label}
                  metric={`${row.count} deal(s)`}
                  detail={formatCurrency(row.valueCents)}
                />
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card style={dashboardPanel} styles={{ body: { padding: 24 } }}>
            <Title level={3} style={{ color: "#ffffff", marginTop: 0 }}>
              Receita por contrato
            </Title>
            <Paragraph style={{ color: "#a0a0a0" }}>
              Leitura rápida de planos mensal, semestral e anual.
            </Paragraph>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {dashboard.revenueRows.map((row) => (
                <DashboardListRow
                  key={row.planType}
                  label={row.label}
                  metric={`${row.count} contrato(s)`}
                  detail={formatCurrency(row.revenueCents)}
                />
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card style={dashboardPanel} styles={{ body: { padding: 24 } }}>
            <Title level={3} style={{ color: "#ffffff", marginTop: 0 }}>
              Atribuição Blog/Ads → receita
            </Title>
            <Paragraph style={{ color: "#a0a0a0" }}>
              Receita agregada por origem/campanha, sem exportar dado sensível.
            </Paragraph>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {dashboard.attributionRows.map((row) => (
                <DashboardListRow
                  key={row.channel}
                  label={attributionChannelLabels[row.channel]}
                  metric={`${row.count} contrato(s)`}
                  detail={formatCurrency(row.revenueCents)}
                />
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card style={dashboardPanel} styles={{ body: { padding: 24 } }}>
            <Title level={3} style={{ color: "#ffffff", marginTop: 0 }}>
              Renovações e continuidade
            </Title>
            <Paragraph style={{ color: "#a0a0a0" }}>
              Contratos que precisam de ação antes de esfriar a relação.
            </Paragraph>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {dashboard.renewalRows.map((row) => (
                <DashboardListRow
                  key={`${row.contactName}-${row.renewalDueAt}`}
                  label={row.contactName}
                  metric={row.planLabel}
                  detail={`${row.renewalDueAt} · ${formatCurrency(row.valueCents)}`}
                />
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {crmSections.map((section) => (
          <Col key={section.key} xs={24} md={12} xl={8}>
            <Card style={sectionCard} styles={{ body: { padding: 24 } }}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Text style={{ color: "#c9a44a", textTransform: "uppercase" }}>
                  {section.eyebrow}
                </Text>
                <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
                  {section.title}
                </Title>
                <Paragraph style={{ color: "#e0e0e0", minHeight: 72 }}>
                  {section.description}
                </Paragraph>
                <Space wrap>
                  {section.bullets.map((bullet) => (
                    <Tag key={bullet} color="gold">
                      {bullet}
                    </Tag>
                  ))}
                </Space>
                <Link to={section.path}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    style={{
                      marginTop: 8,
                      borderRadius: 999,
                      background: "#c9a44a",
                      color: "#0d1f33",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Abrir seção
                  </Button>
                </Link>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </main>
  );
};

const DashboardMetricCard = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) => (
  <Col xs={24} md={12} xl={6}>
    <Card style={metricCard} styles={{ body: { padding: 20 } }}>
      <Text style={{ color: "#a0a0a0", textTransform: "uppercase" }}>
        {label}
      </Text>
      <Title level={2} style={{ color: "#ffffff", margin: "8px 0" }}>
        {value}
      </Title>
      <Text style={{ color: "#e0e0e0" }}>{detail}</Text>
    </Card>
  </Col>
);

const DashboardListRow = ({
  label,
  metric,
  detail,
}: {
  label: string;
  metric: string;
  detail: string;
}) => (
  <Space
    style={{
      justifyContent: "space-between",
      width: "100%",
      borderBottom: "1px solid rgba(201, 164, 74, 0.14)",
      paddingBottom: 10,
    }}
    align="start"
  >
    <Space direction="vertical" size={2}>
      <Text strong style={{ color: "#ffffff" }}>
        {label}
      </Text>
      <Text style={{ color: "#a0a0a0" }}>{metric}</Text>
    </Space>
    <Tag color="gold">{detail}</Tag>
  </Space>
);

export const CrmPipelinePage = () => {
  const [repository] = useState(buildDemoPipelineRepository);
  const [revision, setRevision] = useState(0);
  const [leadName, setLeadName] = useState("Novo lead LuzPerformance");
  const [dealTitle, setDealTitle] = useState("Avaliação + acompanhamento");
  const [valueCents, setValueCents] = useState(600000);
  const [lossReasons, setLossReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const groups = useMemo(
    () => listPipelineDeals(repository),
    [repository, revision],
  );
  const stageChangeAuditLogs = useMemo(
    () =>
      repository
        .listAuditLogs()
        .filter((log) => log.action === "deal_stage.changed")
        .slice(-6)
        .reverse(),
    [repository, revision],
  );

  const refresh = () => setRevision((current) => current + 1);

  const handleCreateDeal = () => {
    setError(undefined);

    const { lead } = createLeadWithAttribution(repository, {
      contact: {
        fullName: leadName,
      },
      attribution: {
        channel: "whatsapp_dm",
        campaign: "pipeline-demo",
      },
      lead: {
        lifecycleStage: "sql",
        interest: "Lead criado manualmente no pipeline demo",
      },
    });

    moveLeadToDeal(repository, lead.id, {
      title: dealTitle,
      stage: "qualification",
      valueCents,
    });

    refresh();
  };

  const handleMoveDeal = (dealId: string, toStage: DealStage) => {
    setError(undefined);

    try {
      moveDealThroughPipeline(repository, {
        dealId,
        toStage,
        actorId: "demo-user",
        lossReason: lossReasons[dealId],
      });
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <main style={shellBackground}>
      <Card style={heroCard} styles={{ body: { padding: 32 } }}>
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <Tag color="gold" style={{ width: "fit-content" }}>
            Pipeline médico-comercial
          </Tag>
          <Title
            level={1}
            style={{ color: "#ffffff", fontFamily: "Orbitron, sans-serif" }}
          >
            Deals agrupados por estágio, com transição auditável
          </Title>
          <Paragraph style={{ color: "#e0e0e0", fontSize: 16, margin: 0 }}>
            Slice demoável: criar lead/deal, mover oportunidade no funil e
            registrar quem moveu, quando moveu, de qual estágio e para qual
            estágio. Perda/cancelamento exige motivo.
          </Paragraph>

          {error ? <Alert type="warning" message={error} showIcon /> : null}

          <Card
            style={{
              border: "1px solid rgba(201, 164, 74, 0.24)",
              borderRadius: 18,
              background: "rgba(13, 31, 51, 0.72)",
            }}
          >
            <Space wrap align="end">
              <Space direction="vertical">
                <Text style={{ color: "#e0e0e0" }}>Lead</Text>
                <Input
                  aria-label="Nome do lead"
                  value={leadName}
                  onChange={(event) => setLeadName(event.target.value)}
                  style={{ minWidth: 240 }}
                />
              </Space>
              <Space direction="vertical">
                <Text style={{ color: "#e0e0e0" }}>Deal</Text>
                <Input
                  aria-label="Título do deal"
                  value={dealTitle}
                  onChange={(event) => setDealTitle(event.target.value)}
                  style={{ minWidth: 260 }}
                />
              </Space>
              <Space direction="vertical">
                <Text style={{ color: "#e0e0e0" }}>Valor</Text>
                <InputNumber
                  aria-label="Valor do deal em centavos"
                  value={valueCents}
                  min={0}
                  step={10000}
                  onChange={(value) => setValueCents(Number(value ?? 0))}
                />
              </Space>
              <Button type="primary" onClick={handleCreateDeal}>
                Criar lead/deal
              </Button>
            </Space>
          </Card>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {groups.map((group) => (
          <Col key={group.stage} xs={24} md={12} xl={8} xxl={6}>
            <Card style={pipelineColumn} styles={{ body: { padding: 18 } }}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Space style={{ justifyContent: "space-between", width: "100%" }}>
                  <Text strong style={{ color: "#ffffff" }}>
                    {group.label}
                  </Text>
                  <Tag color="gold">{group.deals.length}</Tag>
                </Space>

                {group.deals.length === 0 ? (
                  <Text style={{ color: "#a0a0a0" }}>Sem deals neste estágio</Text>
                ) : null}

                {group.deals.map((deal) => {
                  const lead = repository.getLead(deal.leadId);
                  const medicalGovernance = evaluateMedicalGovernancePolicy({
                    content: [deal.title, lead?.interest ?? ""],
                  });

                  return (
                    <Card
                      key={deal.id}
                      size="small"
                      style={{
                        border: "1px solid rgba(201, 164, 74, 0.18)",
                        borderRadius: 14,
                        background: "rgba(20, 42, 66, 0.92)",
                      }}
                    >
                      <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Text strong style={{ color: "#ffffff" }}>
                          {deal.title}
                        </Text>
                        {medicalGovernance.requiresMedicalReview ? (
                          <Tag color="red">Revisão médica obrigatória</Tag>
                        ) : (
                          <Tag color="green">Revisão médica não exigida</Tag>
                        )}
                        <Text style={{ color: "#a0a0a0" }}>
                          R$ {((deal.valueCents ?? 0) / 100).toLocaleString("pt-BR")}
                        </Text>
                        <Select<DealStage>
                          aria-label={`Mover ${deal.title}`}
                          value={deal.stage}
                          options={dealStages.map((stage) => ({
                            value: stage,
                            label: dealStageLabels[stage],
                          }))}
                          onChange={(stage) => handleMoveDeal(deal.id, stage)}
                        />
                        <Input
                          aria-label={`Motivo de perda de ${deal.title}`}
                          placeholder="Motivo obrigatório se mover para perdido/cancelado"
                          value={lossReasons[deal.id] ?? ""}
                          onChange={(event) =>
                            setLossReasons((current) => ({
                              ...current,
                              [deal.id]: event.target.value,
                            }))
                          }
                        />
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ ...sectionCard, marginTop: 24 }} styles={{ body: { padding: 24 } }}>
        <Title level={3} style={{ color: "#ffffff", marginTop: 0 }}>
          Histórico de transições
        </Title>
        <Space direction="vertical" style={{ width: "100%" }}>
          {stageChangeAuditLogs.map((log) => (
            <Text key={log.id} style={{ color: "#e0e0e0" }}>
              {log.createdAt} — {log.actorId}: {log.from} → {log.to}
              {log.metadata?.lossReason
                ? ` — motivo: ${log.metadata.lossReason}`
                : ""}
            </Text>
          ))}
          {stageChangeAuditLogs.length === 0 ? (
            <Text style={{ color: "#a0a0a0" }}>
              Nenhuma transição manual registrada ainda.
            </Text>
          ) : null}
        </Space>
      </Card>
    </main>
  );
};

export const CrmEmptyStatePage = ({ sectionKey }: { sectionKey: CrmSectionKey }) => {
  const section = getCrmSection(sectionKey);

  return (
    <main style={shellBackground}>
      <Card style={heroCard} styles={{ body: { padding: 32 } }}>
        <Space direction="vertical" size={18} style={{ maxWidth: 860 }}>
          <Space size={12}>
            <SafetyCertificateOutlined style={{ color: "#c9a44a", fontSize: 24 }} />
            <Tag color="gold">{section.eyebrow}</Tag>
          </Space>
          <Title
            level={1}
            style={{ color: "#ffffff", fontFamily: "Orbitron, sans-serif" }}
          >
            {section.title}
          </Title>
          <Paragraph style={{ color: "#e0e0e0", fontSize: 16 }}>
            {section.description}
          </Paragraph>
          <Card
            style={{
              border: "1px solid rgba(201, 164, 74, 0.24)",
              borderRadius: 18,
              background: "rgba(13, 31, 51, 0.72)",
            }}
          >
            <Text strong style={{ color: "#ffffff" }}>
              Empty state de domínio
            </Text>
            <Paragraph style={{ color: "#e0e0e0", marginTop: 12, marginBottom: 0 }}>
              {section.nextAction}
            </Paragraph>
          </Card>
          <Space wrap>
            {section.bullets.map((bullet) => (
              <Tag key={bullet} color="gold">
                {bullet}
              </Tag>
            ))}
          </Space>
          <Link to="/">
            <Button
              type="primary"
              style={{
                borderRadius: 999,
                background: "#c9a44a",
                color: "#0d1f33",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Voltar ao dashboard
            </Button>
          </Link>
        </Space>
      </Card>
    </main>
  );
};

export * from "./sections";
