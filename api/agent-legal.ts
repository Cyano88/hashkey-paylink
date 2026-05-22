export type AgentLegalProfile = {
  entityName: string
  entityType: string
  jurisdiction: string
  entityId?: string
  einLast4?: string
  registeredAgent?: string
  registeredAgentAddress?: string
  termsUrl: string
  operatorRole: string
}

export type AgentGovernanceProfile = {
  governanceVersion: string
  modelId?: string
  promptHash?: string
  configHash?: string
  operatingAgreementHash?: string
  updatedAt?: string
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function baseUrl() {
  return clean(process.env.HASH_PAYLINK_BASE_URL) || 'https://hashpaylink.com'
}

export function getAgentLegalProfile(agentSlug = 'hashpaylink-agent'): AgentLegalProfile {
  const termsUrl = clean(process.env.AGENT_LEGAL_TERMS_URL) || `${baseUrl().replace(/\/+$/, '')}/agent-terms`
  return {
    entityName: clean(process.env.AGENT_LEGAL_ENTITY_NAME) || 'Hash PayLink Agent',
    entityType: clean(process.env.AGENT_LEGAL_ENTITY_TYPE) || 'Software agent operated by Hash PayLink',
    jurisdiction: clean(process.env.AGENT_LEGAL_JURISDICTION) || 'Not configured',
    entityId: clean(process.env.AGENT_LEGAL_ENTITY_ID) || undefined,
    einLast4: clean(process.env.AGENT_LEGAL_EIN_LAST4) || undefined,
    registeredAgent: clean(process.env.AGENT_REGISTERED_AGENT) || undefined,
    registeredAgentAddress: clean(process.env.AGENT_REGISTERED_AGENT_ADDRESS) || undefined,
    termsUrl,
    operatorRole: clean(process.env.AGENT_OPERATOR_ROLE) || `${agentSlug} service operator`,
  }
}

export function getAgentGovernanceProfile(): AgentGovernanceProfile {
  return {
    governanceVersion: clean(process.env.AGENT_GOVERNANCE_VERSION) || 'unversioned',
    modelId: clean(process.env.AGENT_MODEL_ID) || undefined,
    promptHash: clean(process.env.AGENT_PROMPT_HASH) || undefined,
    configHash: clean(process.env.AGENT_CONFIG_HASH) || undefined,
    operatingAgreementHash: clean(process.env.AGENT_OPERATING_AGREEMENT_HASH) || undefined,
    updatedAt: clean(process.env.AGENT_GOVERNANCE_UPDATED_AT) || undefined,
  }
}
