import {readFileSync} from 'node:fs';
import {getAddress,isAddress,type Address} from 'viem';
export function configuredXLayerAssets(env: NodeJS.ProcessEnv): Map<string, { address: Address; decimals: number }> {
  const file = env.HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_FILE?.trim();
  const raw = env.HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON?.trim();
  let entries: unknown;
  try {
    const source = file ? readFileSync(file, "utf8").replace(/^\uFEFF/, "") : raw;
    const parsed = source ? JSON.parse(source) : undefined;
    entries = file && parsed && !Array.isArray(parsed) ? (parsed as { assets?: unknown }).assets : parsed;
  } catch {
    throw Error(file ? `X Layer tokenized-asset registry file is invalid: ${file}` : "X Layer tokenized-asset registry JSON is invalid.");
  }
  if (!entries) entries = env.HASHPAYLINK_AGREEMENT_XSTOCKS_ASSET_ADDRESS ? [{ address: env.HASHPAYLINK_AGREEMENT_XSTOCKS_ASSET_ADDRESS, decimals: Number(env.HASHPAYLINK_AGREEMENT_XSTOCKS_ASSET_DECIMALS ?? "") }] : [];
  if (!Array.isArray(entries)) throw Error("X Layer tokenized-asset registry must be a JSON array.");
  const result = new Map<string, { address: Address; decimals: number }>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw Error("X Layer tokenized-asset registry entry is invalid.");
    const value = entry as Record<string, unknown>;
    const token = String(value.address ?? "");
    const decimals = Number(value.decimals);
    if (!isAddress(token) || /^0x0{40}$/i.test(token) || !Number.isInteger(decimals) || decimals < 2 || decimals > 18) throw Error("X Layer tokenized-asset registry entry is invalid.");
    const normalized = getAddress(token);
    const key = normalized.toLowerCase();
    if (result.has(key)) throw Error("X Layer tokenized-asset registry contains a duplicate token.");
    result.set(key, { address: normalized, decimals });
  }
  return result;
}
