import { describe, expect, it } from "vitest";

import {
  contractPlanTypes,
  createContractFromDeal,
  createInMemoryCrmRepository,
  createLeadWithAttribution,
  dealStages,
  lifecycleStages,
  markContractsDueForRenewal,
  moveLeadToDeal,
  recordAttributionTouch,
} from ".";

describe("CRM lead → deal → contract domain model", () => {
  it("declares the lifecycle, deal pipeline, and contract plan vocabulary", () => {
    expect(lifecycleStages).toEqual([
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
    ]);

    expect(dealStages).toEqual([
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
    ]);

    expect(contractPlanTypes).toEqual(["monthly", "semiannual", "annual"]);
  });

  it("can create and read every first-slice entity in the in-memory persistence layer", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });

    const contact = repository.createContact({
      fullName: "Lead LuzPerformance",
      email: "lead@example.com",
    });
    const attribution = repository.createSourceAttribution({
      contactId: contact.id,
      channel: "blog",
      campaign: "artigo-hipertrofia-segura",
      utmSource: "luzperformance-blog",
      utmMedium: "organic",
      utmCampaign: "crm-issue-3",
    });
    const lead = repository.createLead({
      contactId: contact.id,
      lifecycleStage: "mql",
      sourceAttributionIds: [attribution.id],
      interest: "Acompanhamento médico para performance com redução de danos",
    });
    const deal = repository.createDeal({
      contactId: contact.id,
      leadId: lead.id,
      stage: "proposal_sent",
      sourceAttributionIds: [attribution.id],
      title: "Consultoria semestral LuzPerformance",
      valueCents: 600000,
    });
    const contract = repository.createContract({
      contactId: contact.id,
      dealId: deal.id,
      planType: "semiannual",
      sourceAttributionIds: [attribution.id],
      startDate: "2026-06-18",
      endDate: "2026-12-18",
      renewalDueAt: "2026-12-18",
      valueCents: 600000,
    });
    const task = repository.createTask({
      contactId: contact.id,
      leadId: lead.id,
      dealId: deal.id,
      contractId: contract.id,
      title: "Agendar follow-up operacional",
      dueAt: "2026-06-20T12:00:00.000Z",
    });
    const consent = repository.createConsent({
      contactId: contact.id,
      purpose: "Contato comercial e acompanhamento operacional LGPD",
      grantedAt: "2026-06-18T00:00:00.000Z",
    });
    const auditLog = repository.createAuditLog({
      actorId: "test-agent",
      action: "deal_stage.changed",
      entityType: "deals",
      entityId: deal.id,
      contactId: contact.id,
      from: "proposal_sent",
      to: "won",
    });

    expect(repository.getContact(contact.id)).toMatchObject({
      id: contact.id,
      fullName: contact.fullName,
      email: contact.email,
      lifecycleStage: "active_care",
    });
    expect(repository.getSourceAttribution(attribution.id)).toMatchObject(
      attribution,
    );
    expect(repository.getLead(lead.id)).toMatchObject(lead);
    expect(repository.getDeal(deal.id)).toMatchObject(deal);
    expect(repository.getContract(contract.id)).toMatchObject(contract);
    expect(repository.getTask(task.id)).toMatchObject(task);
    expect(repository.getConsent(consent.id)).toMatchObject(consent);
    expect(repository.getAuditLog(auditLog.id)).toMatchObject(auditLog);
  });

  it("moves a lead into a deal and then a contract while preserving attribution and audit", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });

    const { contact, lead, attribution } = createLeadWithAttribution(
      repository,
      {
        contact: {
          fullName: "Paciente Operacional",
          phone: "+5548999999999",
        },
        attribution: {
          channel: "ads",
          campaign: "avaliacao-performance-responsavel",
          landingPage: "/lp/performance",
          utmSource: "meta",
          utmMedium: "paid_social",
          utmCampaign: "avaliacao-responsavel",
        },
        lead: {
          lifecycleStage: "sql",
          interest: "Quer entender acompanhamento médico antes de contrato",
        },
      },
    );

    const deal = moveLeadToDeal(repository, lead.id, {
      title: "Avaliação + acompanhamento anual",
      stage: "won",
      valueCents: 1200000,
      expectedCloseDate: "2026-06-25",
    });

    const contract = createContractFromDeal(repository, deal.id, {
      planType: "annual",
      startDate: "2026-07-01",
      valueCents: 1200000,
    });

    expect(deal.contactId).toBe(contact.id);
    expect(contract.dealId).toBe(deal.id);
    expect(contract.endDate).toBe("2027-07-01");
    expect(contract.renewalDueAt).toBe("2027-07-01");
    expect(deal.sourceAttributionIds).toEqual([attribution.id]);
    expect(contract.sourceAttributionIds).toEqual([attribution.id]);
    expect(repository.getDeal(deal.id)?.stage).toBe("contract_active");
    expect(repository.getContact(contact.id)?.lifecycleStage).toBe(
      "active_care",
    );

    expect(repository.listByContact("tasks", contact.id)).toEqual([
      expect.objectContaining({
        contactId: contact.id,
        dealId: deal.id,
        contractId: contract.id,
        title: "Preparar renovação do contrato anual entre os meses 10 e 11",
        dueAt: "2027-05-01T12:00:00.000Z",
        status: "open",
      }),
    ]);

    expect(repository.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "lead.created",
          entityType: "leads",
          entityId: lead.id,
          contactId: contact.id,
        }),
        expect.objectContaining({
          action: "deal.created",
          entityType: "deals",
          entityId: deal.id,
          contactId: contact.id,
        }),
        expect.objectContaining({
          action: "contract.created",
          entityType: "contracts",
          entityId: contract.id,
          contactId: contact.id,
        }),
        expect.objectContaining({
          action: "deal_stage.changed",
          entityType: "deals",
          entityId: deal.id,
          contactId: contact.id,
          from: "won",
          to: "contract_active",
        }),
        expect.objectContaining({
          action: "task.created",
          entityType: "tasks",
          contactId: contact.id,
        }),
      ]),
    );
  });

  it("stores first-touch UTM and click IDs when creating a lead", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });

    const { attribution } = createLeadWithAttribution(repository, {
      contact: {
        fullName: "Lead vindo de mídia paga",
      },
      attribution: {
        channel: "ads",
        campaign: "lp-avaliacao-junho",
        content: "criativo-medico-responsavel",
        landingPage: "https://luzperformance.com.br/lp/performance",
        referrer: "https://google.com/search?q=luzperformance",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "lp-avaliacao-junho",
        utmContent: "criativo-medico-responsavel",
        utmTerm: "medico-performance",
        gclid: "first-touch-gclid",
        gbraid: "first-touch-gbraid",
        wbraid: "first-touch-wbraid",
      },
    });

    expect(attribution).toMatchObject({
      channel: "ads",
      campaign: "lp-avaliacao-junho",
      content: "criativo-medico-responsavel",
      landingPage: "https://luzperformance.com.br/lp/performance",
      referrer: "https://google.com/search?q=luzperformance",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "lp-avaliacao-junho",
      utmContent: "criativo-medico-responsavel",
      utmTerm: "medico-performance",
      gclid: "first-touch-gclid",
      gbraid: "first-touch-gbraid",
      wbraid: "first-touch-wbraid",
      latestChannel: "ads",
      latestUtmSource: "google",
      latestUtmTerm: "medico-performance",
      latestGclid: "first-touch-gclid",
      firstTouchAt: "2026-06-18T00:00:00.000Z",
      lastTouchAt: "2026-06-18T00:00:00.000Z",
    });
  });

  it("preserves first-touch attribution while latest-touch source updates through the deal", () => {
    const touchDates = [
      "2026-06-18T00:00:00.000Z",
      "2026-06-19T00:00:00.000Z",
    ];
    const repository = createInMemoryCrmRepository({
      clock: () => new Date(touchDates.shift() ?? "2026-06-20T00:00:00.000Z"),
    });
    const { contact, lead, attribution: firstTouch } = createLeadWithAttribution(
      repository,
      {
        contact: {
          fullName: "Lead com múltiplos toques",
        },
        attribution: {
          channel: "ads",
          campaign: "meta-junho",
          landingPage: "https://luzperformance.com.br/lp/performance",
          utmSource: "meta",
          utmMedium: "paid_social",
          utmCampaign: "meta-junho",
          gclid: "gclid-original",
        },
      },
    );

    const latestTouch = recordAttributionTouch(repository, {
      contactId: contact.id,
      attribution: {
        channel: "organic",
        landingPage: "https://luzperformance.com.br/blog/performance-segura",
        referrer: "https://google.com/search?q=performance+segura",
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "blog-performance-segura",
      },
    });
    const deal = moveLeadToDeal(repository, lead.id, {
      title: "Acompanhamento semestral",
      stage: "proposal_sent",
      valueCents: 600000,
    });

    expect(latestTouch.id).toBe(firstTouch.id);
    expect(latestTouch).toMatchObject({
      channel: "ads",
      campaign: "meta-junho",
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "meta-junho",
      gclid: "gclid-original",
      latestChannel: "organic",
      latestLandingPage:
        "https://luzperformance.com.br/blog/performance-segura",
      latestReferrer: "https://google.com/search?q=performance+segura",
      latestUtmSource: "google",
      latestUtmMedium: "organic",
      latestUtmCampaign: "blog-performance-segura",
      firstTouchAt: "2026-06-18T00:00:00.000Z",
      lastTouchAt: "2026-06-19T00:00:00.000Z",
    });
    expect(deal.sourceAttributionIds).toEqual([firstTouch.id]);
  });

  it("does not let internal blog navigation overwrite original campaign attribution", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });
    const { contact, attribution: firstTouch } = createLeadWithAttribution(
      repository,
      {
        contact: {
          fullName: "Lead navegando pelo blog",
        },
        attribution: {
          channel: "ads",
          campaign: "google-search-junho",
          landingPage: "https://luzperformance.com.br/lp/performance",
          referrer: "https://google.com/search?q=terapia+hormonal+segura",
          utmSource: "google",
          utmMedium: "cpc",
          utmCampaign: "google-search-junho",
          gclid: "gclid-canonico",
        },
      },
    );

    const afterInternalNavigation = recordAttributionTouch(repository, {
      contactId: contact.id,
      attribution: {
        channel: "blog",
        landingPage: "https://luzperformance.com.br/blog/artigo-interno",
        referrer: "https://luzperformance.com.br/lp/performance",
      },
    });

    expect(afterInternalNavigation).toEqual(firstTouch);
    expect(repository.getSourceAttribution(firstTouch.id)).toMatchObject({
      channel: "ads",
      campaign: "google-search-junho",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "google-search-junho",
      gclid: "gclid-canonico",
      latestChannel: "ads",
      latestUtmSource: "google",
      latestGclid: "gclid-canonico",
      firstTouchAt: "2026-06-18T00:00:00.000Z",
      lastTouchAt: "2026-06-18T00:00:00.000Z",
    });
  });

  it("generates renewal work for monthly, semiannual, and annual contract plans", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });

    const scenarios = [
      {
        planType: "monthly" as const,
        startDate: "2026-07-01",
        expectedEndDate: "2026-08-01",
        expectedTaskTitle: "Check-in de retenção do contrato mensal",
        expectedTaskDueAt: "2026-07-15T12:00:00.000Z",
      },
      {
        planType: "semiannual" as const,
        startDate: "2026-07-01",
        expectedEndDate: "2027-01-01",
        expectedTaskTitle:
          "Preparar renovação do contrato semestral antes do mês 5",
        expectedTaskDueAt: "2026-11-01T12:00:00.000Z",
      },
      {
        planType: "annual" as const,
        startDate: "2026-07-01",
        expectedEndDate: "2027-07-01",
        expectedTaskTitle:
          "Preparar renovação do contrato anual entre os meses 10 e 11",
        expectedTaskDueAt: "2027-05-01T12:00:00.000Z",
      },
    ];

    for (const scenario of scenarios) {
      const { contact, lead } = createLeadWithAttribution(repository, {
        contact: {
          fullName: `Paciente ${scenario.planType}`,
        },
        attribution: {
          channel: "direct",
        },
      });
      const deal = moveLeadToDeal(repository, lead.id, {
        title: `Contrato ${scenario.planType}`,
        stage: "won",
        valueCents: 100000,
      });

      const contract = createContractFromDeal(repository, deal.id, {
        planType: scenario.planType,
        startDate: scenario.startDate,
        valueCents: 100000,
      });

      expect(contract).toMatchObject({
        planType: scenario.planType,
        status: "active",
        startDate: scenario.startDate,
        endDate: scenario.expectedEndDate,
        renewalDueAt: scenario.expectedEndDate,
      });
      expect(repository.listByContact("tasks", contact.id)).toEqual([
        expect.objectContaining({
          contactId: contact.id,
          dealId: deal.id,
          contractId: contract.id,
          title: scenario.expectedTaskTitle,
          dueAt: scenario.expectedTaskDueAt,
          status: "open",
        }),
      ]);
    }
  });

  it("prevents active contracts from proposal-stage deals", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });
    const { lead } = createLeadWithAttribution(repository, {
      contact: {
        fullName: "Lead ainda em proposta",
      },
      attribution: {
        channel: "whatsapp_dm",
      },
    });
    const deal = moveLeadToDeal(repository, lead.id, {
      title: "Proposta ainda não ganha",
      stage: "proposal_sent",
      valueCents: 300000,
    });

    expect(() =>
      createContractFromDeal(repository, deal.id, {
        planType: "monthly",
        startDate: "2026-07-01",
        valueCents: 300000,
      }),
    ).toThrow("Contract can only be created from a won or active deal");
  });

  it("marks contracts, deals, and contacts as renewal due when renewal date arrives", () => {
    const repository = createInMemoryCrmRepository({
      clock: () => new Date("2026-06-18T00:00:00.000Z"),
    });
    const { contact, lead } = createLeadWithAttribution(repository, {
      contact: {
        fullName: "Paciente em janela de renovação",
      },
      attribution: {
        channel: "referral",
      },
    });
    const deal = moveLeadToDeal(repository, lead.id, {
      title: "Contrato mensal em renovação",
      stage: "won",
      valueCents: 100000,
    });
    const contract = createContractFromDeal(repository, deal.id, {
      planType: "monthly",
      startDate: "2026-07-01",
      valueCents: 100000,
    });

    expect(markContractsDueForRenewal(repository, "2026-07-31")).toEqual([]);

    expect(markContractsDueForRenewal(repository, "2026-08-01")).toEqual([
      expect.objectContaining({
        id: contract.id,
        status: "renewal_due",
      }),
    ]);
    expect(repository.getContract(contract.id)?.status).toBe("renewal_due");
    expect(repository.getDeal(deal.id)?.stage).toBe("renewal_due");
    expect(repository.getContact(contact.id)?.lifecycleStage).toBe(
      "renewal_due",
    );

    expect(repository.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "contract_status.changed",
          entityType: "contracts",
          entityId: contract.id,
          contactId: contact.id,
          from: "active",
          to: "renewal_due",
        }),
        expect.objectContaining({
          action: "deal_stage.changed",
          entityType: "deals",
          entityId: deal.id,
          contactId: contact.id,
          from: "contract_active",
          to: "renewal_due",
        }),
        expect.objectContaining({
          action: "lifecycle_stage.changed",
          entityType: "contacts",
          entityId: contact.id,
          contactId: contact.id,
          from: "active_care",
          to: "renewal_due",
        }),
      ]),
    );
  });
});
