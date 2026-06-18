import { evaluateMedicalGovernancePolicy } from "./medical-governance-policy";
import type { CrmCollectionName, NewAuditLog } from "./types";

export type CrmSecurityRole =
  | "owner"
  | "admin"
  | "medical_reviewer"
  | "crm_operator"
  | "marketing_operator"
  | "readonly_auditor";

export type CrmAccessAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "review";

export type CrmAccessScope =
  | "commercial_pipeline"
  | "marketing_attribution"
  | "consent_management"
  | "audit_trace"
  | "sensitive_health_boundary"
  | "ads_conversion_export";

export type CrmSensitivityLevel =
  | "operational"
  | "personal_data"
  | "sensitive_health_data";

export interface SensitiveAccessRequest {
  actorId: string;
  actorRole: CrmSecurityRole;
  action: CrmAccessAction;
  scope: CrmAccessScope;
  entityType: CrmCollectionName;
  entityId: string;
  contactId?: string;
  sensitivity: CrmSensitivityLevel;
  reason: string;
}

export interface SensitiveAccessDecision {
  allowed: boolean;
  reason: string;
  requiredRoles: CrmSecurityRole[];
  trace: NewAuditLog;
}

type RolePermission = {
  scopes: CrmAccessScope[];
  actions: CrmAccessAction[];
  canAccessSensitiveHealthData: boolean;
};

const rolePermissions: Record<CrmSecurityRole, RolePermission> = {
  owner: {
    scopes: [
      "commercial_pipeline",
      "marketing_attribution",
      "consent_management",
      "audit_trace",
      "sensitive_health_boundary",
      "ads_conversion_export",
    ],
    actions: ["read", "create", "update", "delete", "export", "review"],
    canAccessSensitiveHealthData: true,
  },
  admin: {
    scopes: [
      "commercial_pipeline",
      "marketing_attribution",
      "consent_management",
      "audit_trace",
      "sensitive_health_boundary",
      "ads_conversion_export",
    ],
    actions: ["read", "create", "update", "delete", "export", "review"],
    canAccessSensitiveHealthData: true,
  },
  medical_reviewer: {
    scopes: [
      "commercial_pipeline",
      "consent_management",
      "audit_trace",
      "sensitive_health_boundary",
    ],
    actions: ["read", "update", "review"],
    canAccessSensitiveHealthData: true,
  },
  crm_operator: {
    scopes: [
      "commercial_pipeline",
      "marketing_attribution",
      "consent_management",
    ],
    actions: ["read", "create", "update"],
    canAccessSensitiveHealthData: false,
  },
  marketing_operator: {
    scopes: ["marketing_attribution", "ads_conversion_export"],
    actions: ["read", "create", "export"],
    canAccessSensitiveHealthData: false,
  },
  readonly_auditor: {
    scopes: ["audit_trace", "commercial_pipeline", "marketing_attribution"],
    actions: ["read"],
    canAccessSensitiveHealthData: false,
  },
};

export const sensitiveHealthAccessRoles: CrmSecurityRole[] = [
  "owner",
  "admin",
  "medical_reviewer",
];

export const evaluateSensitiveAccess = (
  request: SensitiveAccessRequest,
): SensitiveAccessDecision => {
  const permission = rolePermissions[request.actorRole];
  const denialReason = getDenialReason(request, permission);
  const allowed = !denialReason;
  const reason = denialReason ?? "Access allowed by CRM role policy";

  return {
    allowed,
    reason,
    requiredRoles: requiredRolesFor(request),
    trace: buildSensitiveAccessTrace(request, allowed, reason),
  };
};

export const assertSensitiveAccess = (
  request: SensitiveAccessRequest,
): SensitiveAccessDecision => {
  const decision = evaluateSensitiveAccess(request);

  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  return decision;
};

const getDenialReason = (
  request: SensitiveAccessRequest,
  permission: RolePermission,
): string | undefined => {
  if (!permission.scopes.includes(request.scope)) {
    return `Role ${request.actorRole} cannot access ${request.scope}`;
  }

  if (!permission.actions.includes(request.action)) {
    return `Role ${request.actorRole} cannot ${request.action} ${request.scope}`;
  }

  if (
    request.sensitivity === "sensitive_health_data" &&
    !permission.canAccessSensitiveHealthData
  ) {
    return "Sensitive health data requires owner, admin, or medical reviewer role";
  }

  if (
    request.sensitivity === "sensitive_health_data" &&
    request.action === "export"
  ) {
    return "Sensitive health data cannot be exported from the CRM boundary";
  }

  return undefined;
};

const requiredRolesFor = (request: SensitiveAccessRequest): CrmSecurityRole[] => {
  return Object.entries(rolePermissions)
    .filter(([, permission]) => {
      return (
        permission.scopes.includes(request.scope) &&
        permission.actions.includes(request.action) &&
        (request.sensitivity !== "sensitive_health_data" ||
          permission.canAccessSensitiveHealthData) &&
        !(request.sensitivity === "sensitive_health_data" && request.action === "export")
      );
    })
    .map(([role]) => role as CrmSecurityRole);
};

const buildSensitiveAccessTrace = (
  request: SensitiveAccessRequest,
  allowed: boolean,
  reason: string,
): NewAuditLog => {
  const sanitizedReason = sanitizeAccessReason(request.reason);

  return {
    actorId: request.actorId,
    action: allowed ? "security_access.allowed" : "security_access.denied",
    entityType: request.entityType,
    entityId: request.entityId,
    contactId: request.contactId,
    metadata: {
      actorRole: request.actorRole,
      accessAction: request.action,
      accessScope: request.scope,
      sensitivity: request.sensitivity,
      decision: allowed ? "allowed" : "denied",
      reason,
      accessReason: sanitizedReason.reason,
      accessReasonContainsSensitiveHealthData:
        sanitizedReason.containsSensitiveHealthData,
      accessReasonSensitiveTopicCategories:
        sanitizedReason.sensitiveTopicCategories,
    },
  };
};

const sanitizeAccessReason = (reason: string) => {
  const policy = evaluateMedicalGovernancePolicy({ content: reason });

  if (!policy.containsHealthSensitiveData) {
    return {
      reason,
      containsSensitiveHealthData: false,
      sensitiveTopicCategories: "",
    };
  }

  return {
    reason: "redacted_sensitive_access_reason",
    containsSensitiveHealthData: true,
    sensitiveTopicCategories: policy.matchedCategories.join(","),
  };
};
