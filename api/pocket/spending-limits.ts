import type { Request, Response } from "express";
import { verifiedPrivyUser } from "../privy-circle-link.js";
import { resolvePaycrestOfframpAvailability } from "../paycrest-pos.js";

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, {
  expiresAt: number;
  value: { maxUsdc: number; ngnEquivalent: number; asOf: number };
}>();
const pending = new Map<string, Promise<{
  maxUsdc: number;
  ngnEquivalent: number;
  asOf: number;
}>>();

async function readBankPayoutLimit(fiat: 'NGN' | 'UGX' = 'NGN') {
  const now = Date.now();
  const cached = cache.get(fiat), inFlight = pending.get(fiat);
  if (cached && cached.expiresAt > now) return cached.value;
  if (inFlight) return inFlight;
  const work = (async () => {
    const configuredCeiling = Number(
      process.env.POCKET_BANK_PAYOUT_LIMIT_PROBE_USDC || 10_000,
    );
    const ceiling = Number.isFinite(configuredCeiling)
      ? Math.max(1, Math.min(Math.floor(configuredCeiling), 1_000_000))
      : 10_000;
    const availability = await resolvePaycrestOfframpAvailability({
      amount: String(ceiling),
      network: "base",
      token: "USDC",
      fiat,
      maxProbes: 10,
    });
    const maxUsdc = Number(availability.availableUsdc);
    if (
      !Number.isFinite(maxUsdc) ||
      maxUsdc <= 0 ||
      !Number.isFinite(availability.rate) ||
      availability.rate <= 0
    ) {
      throw new Error("Current bank payout capacity is unavailable.");
    }
    const value = {
      maxUsdc,
      ngnEquivalent: maxUsdc * availability.rate,
      asOf: Date.now(),
    };
    cache.set(fiat, { value, expiresAt: Date.now() + CACHE_MS });
    return value;
  })().finally(() => {
    pending.delete(fiat);
  });
  pending.set(fiat, work);
  return work;
}

export async function readPocketBankPayoutLimit(fiat: 'NGN' | 'UGX' = 'NGN') {
  return readBankPayoutLimit(fiat);
}

export default async function pocketSpendingLimitsHandler(
  req: Request,
  res: Response,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  try {
    await verifiedPrivyUser(req);
    return res.json({ ok: true, bankPayout: await readBankPayoutLimit() });
  } catch (reason) {
    const status =
      reason && typeof reason === "object" && "status" in reason
        ? Number(reason.status)
        : 503;
    const message =
      reason instanceof Error
        ? reason.message
        : "Current bank payout limit is unavailable.";
    return res
      .status(Number.isFinite(status) ? status : 503)
      .json({ ok: false, error: message.slice(0, 180) });
  }
}
