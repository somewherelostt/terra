// Member avatars: a DiceBear default seeded by account name, overridable from the
// member's own NEAR Social data (written by the member, signed in their wallet).

import { useEffect, useState } from 'react'
import { TGAS, ONE_NEAR, view } from './near'
import type { Tx } from './dao'

/** The DiceBear style and colourway (thumbs, T3: warm faces on near-black). One place to change them. */
export const AVATAR_STYLE = 'thumbs'
export const AVATAR_OPTIONS = 'backgroundColor=1a1a1d&shapeColor=ff8a4c,e2501f,f6b38a,fff1e6&eyesColor=1a1a1d&mouthColor=1a1a1d'
/** Styles offered in the "Change avatar" picker (just one: members shuffle the seed). */
export const AVATAR_STYLES = [AVATAR_STYLE]

/** NEAR Social (SocialDB) on testnet. Mainnet is social.near. */
export const SOCIAL_CONTRACT = 'v1.social08.testnet'

export interface AvatarChoice {
  style: string
  seed: string
}

export function dicebearUrl(style: string, seed: string): string {
  const opts = style === AVATAR_STYLE ? `&${AVATAR_OPTIONS}` : ''
  return `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/svg?seed=${encodeURIComponent(seed)}${opts}`
}

/**
 * A group's tile: DiceBear "initials" (City Club → CC) on a solid colour picked from the name.
 * Palette in Terra's colours: terracotta, deep blue, dark lime, plum, slate. No gradients.
 */
export function groupAvatarUrl(name: string): string {
  const opts = 'backgroundColor=e2501f,c2410c,1d4ed8,0b2fa8,3d6b00,6d28d9,334155&textColor=ffffff&fontWeight=500&fontSize=40&chars=2'
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&${opts}`
}

export function defaultAvatar(accountId: string): string {
  return dicebearUrl(AVATAR_STYLE, accountId)
}

// ---------- batched reads with a tiny shared cache ----------

const cache = new Map<string, string>() // accountId -> url
const pending = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

interface SocialProfile {
  terra?: { avatar?: string }
  profile?: { image?: { url?: string; ipfs_cid?: string } }
}

function urlFrom(entry: SocialProfile | undefined): string | null {
  const raw = entry?.terra?.avatar
  if (raw) {
    try {
      const c = JSON.parse(raw) as AvatarChoice
      if (c.style && c.seed) return dicebearUrl(c.style, c.seed)
    } catch {
      /* ignore bad data */
    }
  }
  const img = entry?.profile?.image
  if (img?.url && /^https:\/\//.test(img.url)) return img.url
  if (img?.ipfs_cid && /^[a-zA-Z0-9]+$/.test(img.ipfs_cid)) return `https://ipfs.near.social/ipfs/${img.ipfs_cid}`
  return null
}

async function flush() {
  timer = null
  const ids = [...pending]
  pending.clear()
  if (!ids.length) return
  try {
    const keys = ids.flatMap((id) => [`${id}/terra/avatar`, `${id}/profile/image/**`])
    const data = await view<Record<string, SocialProfile>>(SOCIAL_CONTRACT, 'get', { keys })
    for (const id of ids) cache.set(id, urlFrom(data?.[id]) ?? defaultAvatar(id))
  } catch {
    for (const id of ids) if (!cache.has(id)) cache.set(id, defaultAvatar(id))
  }
  listeners.forEach((l) => l())
}

function request(id: string) {
  if (cache.has(id) || pending.has(id)) return
  pending.add(id)
  if (!timer) timer = setTimeout(flush, 40)
}

/** Read again after a member saves a new avatar. */
export function invalidateAvatar(id: string) {
  cache.delete(id)
  request(id)
}

export function useAvatarUrl(accountId: string): string {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    request(accountId)
    return () => {
      listeners.delete(l)
    }
  }, [accountId])
  return cache.get(accountId) ?? defaultAvatar(accountId)
}

export async function readSavedChoice(accountId: string): Promise<AvatarChoice | null> {
  const data = await view<Record<string, SocialProfile>>(SOCIAL_CONTRACT, 'get', { keys: [`${accountId}/terra/avatar`] })
  const raw = data?.[accountId]?.terra?.avatar
  if (!raw) return null
  try {
    return JSON.parse(raw) as AvatarChoice
  } catch {
    return null
  }
}

/**
 * Save the choice to the member's own NEAR Social data. A first write pays for storage
 * (a small deposit, kept as the member's SocialDB storage balance).
 */
export async function saveAvatarTx(accountId: string, choice: AvatarChoice): Promise<Tx> {
  let deposit = 0n
  try {
    const st = await view<{ used_bytes: number; available_bytes: number } | null>(SOCIAL_CONTRACT, 'get_account_storage', { account_id: accountId })
    if (!st) deposit = ONE_NEAR / 20n // 0.05 NEAR for a first write
    else if (st.available_bytes < 600) deposit = ONE_NEAR / 100n
  } catch {
    deposit = ONE_NEAR / 20n
  }
  return {
    receiverId: SOCIAL_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'set',
          args: { data: { [accountId]: { terra: { avatar: JSON.stringify(choice) } } } },
          gas: (100n * TGAS).toString(),
          deposit: deposit.toString(),
        },
      },
    ],
  }
}
