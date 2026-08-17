import { POCKET_API } from "../lib/pocketSchemas";

export type PocketBankPayoutLimit = {
  maxUsdc: number;
  ngnEquivalent: number;
  asOf: number;
};

export async function readPocketBankPayoutLimit(input: {
  accessToken: string;
  fetcher?: typeof fetch;
}): Promise<PocketBankPayoutLimit> {
  const response = await (input.fetcher ?? fetch)(POCKET_API.spendingLimits, {
    method: "GET",
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  const body = (await response.json().catch(() => undefined)) as
    | { ok?: unknown; error?: unknown; bankPayout?: Record<string, unknown> }
    | undefined;
  if (!response.ok || body?.ok !== true)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Current bank payout limit is unavailable.",
    );
  const maxUsdc = Number(body.bankPayout?.maxUsdc);
  const ngnEquivalent = Number(body.bankPayout?.ngnEquivalent);
  const asOf = Number(body.bankPayout?.asOf);
  if (
    ![maxUsdc, ngnEquivalent, asOf].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    throw new Error("Current bank payout limit response was invalid.");
  }
  return { maxUsdc, ngnEquivalent, asOf };
}
