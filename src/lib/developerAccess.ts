import {effectiveProductCapabilities, type ProductCapability} from './developerProducts.js'

export type DeveloperAccountType = 'individual' | 'business'
type AccessProject = {
  accountType?: DeveloperAccountType; personalKycVerified?: boolean;
  checkoutMode?: string; settlementMode?: string; operationalStatus?: string; removal?: unknown;
  businessVerification?: {required?: boolean; status: string; reviewedAt?: string};
  capabilities?: readonly ProductCapability[]; productSettingsVersion?: number;
}
// Verification is a product gate, not permission to bypass suspension or route activation.
export function productionCapabilities(project: AccessProject): ProductCapability[] {
  if (project.removal || project.operationalStatus === 'suspended' || ['rejected','changes_requested'].includes(project.businessVerification?.status ?? '') || (project.businessVerification?.reviewedAt && project.businessVerification.status !== 'approved')) return []
  const capabilities = effectiveProductCapabilities(project)
  const local = project.settlementMode === 'ngn' || project.settlementMode === 'ugx'
  if (local) return (project.accountType === 'individual' ? project.personalKycVerified : project.businessVerification?.status === 'approved') ? capabilities.filter(c => c === 'hosted_checkout') : []
  if (!project.businessVerification?.required || project.businessVerification.status === 'approved') return capabilities
  return project.checkoutMode === 'human' && project.settlementMode === 'usdc' ? capabilities.filter(c => c === 'hosted_checkout') : []
}
export function productionVerificationAllows(project: AccessProject) { return productionCapabilities(project).length > 0 }
