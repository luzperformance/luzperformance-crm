import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { resources } from "../../config/resources";
import {
  CrmDashboardPage,
  CrmEmptyStatePage,
  CrmPipelinePage,
  crmSections,
} from ".";

describe("CRM product shell", () => {
  it("exposes CRM-specific top-level navigation resources", () => {
    const labels = resources.map((resource) => resource.meta?.label);

    expect(labels).toEqual([
      "Dashboards",
      "Leads",
      "Pipeline",
      "Contracts",
      "Tasks",
      "Blog Attribution",
      "Ads Attribution",
      "Compliance",
    ]);
  });

  it("renders navigation entry points for every CRM work section", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CrmDashboardPage />
      </MemoryRouter>,
    );

    expect(html).toContain("CRM médico-operacional LuzPerformance");
    expect(html).toContain("Funil HubSpot-like");
    expect(html).toContain("Receita por contrato");
    expect(html).toContain("Atribuição Blog/Ads → receita");
    expect(html).toContain("Renovações e continuidade");
    expect(html).toContain("Lead Blog — contrato semestral");

    for (const section of crmSections) {
      expect(html).toContain(section.title);
      expect(html).toContain(section.path);
    }
  });

  it("renders a medical compliance empty state with a next action", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CrmEmptyStatePage sectionKey="compliance" />
      </MemoryRouter>,
    );

    expect(html).toContain("Compliance");
    expect(html).toContain("LGPD e fronteira médica");
    expect(html).toContain("bloquear automações de diagnóstico");
  });

  it("renders the demoable medical consulting pipeline slice", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CrmPipelinePage />
      </MemoryRouter>,
    );

    expect(html).toContain("Deals agrupados por estágio");
    expect(html).toContain("Criar lead/deal");
    expect(html).toContain("Avaliação médica pendente");
    expect(html).toContain("Revisão médica obrigatória");
    expect(html).toContain("Histórico de transições");
    expect(html).toContain("Motivo obrigatório se mover para perdido/cancelado");
  });
});
