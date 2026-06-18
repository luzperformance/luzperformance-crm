import { evaluateMedicalGovernancePolicy } from "./medical-governance-policy";
import type {
  MedicalGovernanceFlag,
  SensitiveHealthTopicCategory,
} from "./medical-governance-policy";

export type CommunicationTemplateChannel =
  | "whatsapp"
  | "instagram_dm"
  | "email"
  | "sms"
  | "internal_note";

export type CommunicationTemplateAudience =
  | "lead"
  | "patient"
  | "contract"
  | "internal";

export type CommunicationTemplatePurpose =
  | "marketing"
  | "operational"
  | "follow_up"
  | "renewal"
  | "education";

export type CommunicationTemplateApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected";

export type CommunicationTemplateMedicalReviewStatus =
  | "not_required"
  | "medical_review_required"
  | "medical_review_approved"
  | "medical_review_rejected";

export interface CommunicationTemplateMedicalReviewGate {
  required: boolean;
  status: CommunicationTemplateMedicalReviewStatus;
  flags: MedicalGovernanceFlag[];
  matchedCategories: SensitiveHealthTopicCategory[];
  reviewedById?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface CommunicationTemplateApprovalTrail {
  submittedById?: string;
  submittedAt?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedById?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface CommunicationTemplate {
  id: string;
  name: string;
  channel: CommunicationTemplateChannel;
  audience: CommunicationTemplateAudience;
  purpose: CommunicationTemplatePurpose;
  body: string;
  approvalStatus: CommunicationTemplateApprovalStatus;
  medicalReview: CommunicationTemplateMedicalReviewGate;
  approval: CommunicationTemplateApprovalTrail;
}

export interface NewCommunicationTemplateDraft {
  id: string;
  name: string;
  channel: CommunicationTemplateChannel;
  audience: CommunicationTemplateAudience;
  purpose: CommunicationTemplatePurpose;
  body: string;
}

interface ActorTimestampInput {
  actorId: string;
  at: string;
}

interface RejectTemplateInput extends ActorTimestampInput {
  reason: string;
}

interface RecordMedicalReviewInput extends ActorTimestampInput {
  decision: "approved" | "rejected";
  reason?: string;
}

export const buildCommunicationTemplateDraft = (
  input: NewCommunicationTemplateDraft,
): CommunicationTemplate => {
  const policy = evaluateMedicalGovernancePolicy({ content: input.body });

  return {
    ...input,
    approvalStatus: "draft",
    medicalReview: {
      required: policy.requiresMedicalReview,
      status: policy.requiresMedicalReview
        ? "medical_review_required"
        : "not_required",
      flags: policy.flags,
      matchedCategories: policy.matchedCategories,
    },
    approval: {},
  };
};

export const submitCommunicationTemplateForApproval = (
  template: CommunicationTemplate,
  input: ActorTimestampInput,
): CommunicationTemplate => {
  if (template.approvalStatus === "approved") {
    throw new Error("Approved communication templates cannot be resubmitted");
  }

  return {
    ...template,
    approvalStatus: "pending_approval",
    approval: {
      submittedById: input.actorId,
      submittedAt: input.at,
    },
  };
};

export const recordCommunicationTemplateMedicalReview = (
  template: CommunicationTemplate,
  input: RecordMedicalReviewInput,
): CommunicationTemplate => {
  if (!template.medicalReview.required) {
    throw new Error("Medical review is not required for this template");
  }

  if (input.decision === "rejected" && !input.reason?.trim()) {
    throw new Error("Rejected medical reviews require a reason");
  }

  const medicalReview: CommunicationTemplateMedicalReviewGate = {
    ...template.medicalReview,
    status:
      input.decision === "approved"
        ? "medical_review_approved"
        : "medical_review_rejected",
    reviewedById: input.actorId,
    reviewedAt: input.at,
    rejectionReason:
      input.decision === "rejected" ? input.reason?.trim() : undefined,
  };

  return {
    ...template,
    approvalStatus:
      input.decision === "rejected" ? "rejected" : template.approvalStatus,
    medicalReview,
    approval:
      input.decision === "rejected"
        ? {
            ...template.approval,
            rejectedById: input.actorId,
            rejectedAt: input.at,
            rejectionReason: input.reason?.trim(),
          }
        : template.approval,
  };
};

export const approveCommunicationTemplate = (
  template: CommunicationTemplate,
  input: ActorTimestampInput,
): CommunicationTemplate => {
  if (template.approvalStatus !== "pending_approval") {
    throw new Error("Only pending communication templates can be approved");
  }

  if (template.medicalReview.status === "medical_review_required") {
    throw new Error("Medical review is required before template approval");
  }

  if (template.medicalReview.status === "medical_review_rejected") {
    throw new Error("Medical review rejected this communication template");
  }

  return {
    ...template,
    approvalStatus: "approved",
    approval: {
      ...template.approval,
      approvedById: input.actorId,
      approvedAt: input.at,
    },
  };
};

export const rejectCommunicationTemplate = (
  template: CommunicationTemplate,
  input: RejectTemplateInput,
): CommunicationTemplate => {
  if (!input.reason.trim()) {
    throw new Error("Rejected communication templates require a reason");
  }

  return {
    ...template,
    approvalStatus: "rejected",
    approval: {
      ...template.approval,
      rejectedById: input.actorId,
      rejectedAt: input.at,
      rejectionReason: input.reason.trim(),
    },
  };
};

export const canUseCommunicationTemplate = (
  template: CommunicationTemplate,
): boolean => {
  return (
    template.approvalStatus === "approved" &&
    ["not_required", "medical_review_approved"].includes(
      template.medicalReview.status,
    )
  );
};

export const assertCommunicationTemplateCanBeUsed = (
  template: CommunicationTemplate,
): void => {
  if (!canUseCommunicationTemplate(template)) {
    throw new Error(
      "Communication template must be approved and pass medical review before use",
    );
  }
};
