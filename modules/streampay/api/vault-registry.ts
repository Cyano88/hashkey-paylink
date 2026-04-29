/**
 * /api/register-vault  POST  — viewer's device auto-submits ghost vault after each sign
 * /api/get-vault       GET   — creator fetches latest vault for settlement dashboard
 *
 * Keyed by contentId_viewerAddress (lowercase).
 * Only the latest (highest amountRaw) entry is kept per pair.
 * Storage: in-memory — replace with Redis for production persistence.
 */

import type { Request, Response } from 'express'
import { isAddress } from 'viem'

type VaultEntry = {
  sig:       string
  amountRaw: string
  nonce:     string
  deadline:  string
  viewer:    string
  creator:   string
  contentId: string
  ts:        number
}

const registry = new Map<string, VaultEntry>()

function key(contentId: string, viewer: string) {
  return `${contentId}_${viewer.toLowerCase()}`
}

// ── POST /api/register-vault ──────────────────────────────────────────────────
export async function registerVault(req: Request, res: Response) {
  const body = (req.body ?? {}) as Partial<VaultEntry>
  const { sig, amountRaw, nonce, deadline, viewer, creator, contentId } = body

  if (!sig || !amountRaw || !nonce || !deadline || !viewer || !creator || !contentId) {
    return res.status(400).json({ ok: false, error: 'Missing vault fields' })
  }
  if (!isAddress(viewer) || !isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'viewer and creator must be valid EVM addresses' })
  }

  const existing = registry.get(key(contentId, viewer))

  // Only store if this entry has a higher amount than what we already have
  if (!existing || BigInt(amountRaw) >= BigInt(existing.amountRaw)) {
    registry.set(key(contentId, viewer), {
      sig, amountRaw, nonce, deadline,
      viewer: viewer.toLowerCase(),
      creator: creator.toLowerCase(),
      contentId,
      ts: body.ts ?? Date.now(),
    })
  }

  return res.status(200).json({ ok: true })
}

// ── GET /api/get-vault ────────────────────────────────────────────────────────
export async function getVault(req: Request, res: Response) {
  const { id, viewer } = req.query as { id?: string; viewer?: string }

  if (!id || !viewer) {
    return res.status(400).json({ ok: false, error: 'id and viewer are required' })
  }

  const entry = registry.get(key(id, viewer))
  if (!entry) {
    return res.status(404).json({
      ok:    false,
      error: 'No vault found — viewer may not have signed yet, or server restarted',
    })
  }

  return res.status(200).json({ ok: true, vault: entry })
}
