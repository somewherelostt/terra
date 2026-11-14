// Terra's FAQ: one short list for the landing page and the docs.
// The words live in the i18n catalogs as `faq.<id>.q` and `faq.<id>.a`.
// Answer markup (rendered by components/Faq.tsx): [text](https://…) for a link, **text** for bold.

export const FAQ_IDS = ['what', 'holds', 'approve', 'chains', 'start', 'cost', 'open-source', 'real-money'] as const
export type FaqId = (typeof FAQ_IDS)[number]

/** The question a URL points at: `#faq-<id>` on the landing page, `#/docs?s=faq&q=<id>` in the docs. */
export function faqIdFromHash(hash = window.location.hash): FaqId | null {
  const m = /^#faq-([\w-]+)$/.exec(hash)
  const id = m?.[1] ?? new URLSearchParams(hash.split('?')[1] ?? '').get('q')
  return (FAQ_IDS as readonly string[]).includes(id ?? '') ? (id as FaqId) : null
}
