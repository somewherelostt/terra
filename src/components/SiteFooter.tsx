const ICON = `${import.meta.env.BASE_URL}favicon.svg`
const REPO = 'https://github.com/somewherelostt/terra'
const README = `${REPO}#readme`

type Link = { label: string; href: string; external?: boolean }

/**
 * The public site footer: landing page and the public board. Not used inside the signed-in app.
 * `home` prefixes in-page links ('' on the landing, './' elsewhere); `boardUrl` is the live demo board.
 */
export default function SiteFooter({ home = '', boardUrl }: { home?: string; boardUrl: string }) {
  const columns: { title: string; links: Link[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'How it works', href: `${home}#how` },
        { label: 'Approvals', href: `${home}#approvals` },
        { label: 'Trust', href: `${home}#trust` },
        { label: 'Live board', href: boardUrl },
        { label: 'Start a group', href: `${home}#/create` },
      ],
    },
    {
      title: 'Docs',
      links: [
        { label: 'Overview', href: `${home}#/docs` },
        { label: 'Quick start', href: `${home}#/docs?s=quick-start` },
        { label: 'Approvals and tiers', href: `${home}#/docs?s=tiers` },
        { label: 'Payouts to other chains', href: `${home}#/docs?s=payouts` },
        { label: 'Allowances', href: `${home}#/docs?s=allowances` },
        { label: 'FAQ', href: `${home}#/docs?s=faq` },
      ],
    },
    {
      title: 'Project',
      links: [
        { label: 'GitHub', href: REPO, external: true },
        { label: 'README', href: README, external: true },
        { label: 'MIT License', href: `${REPO}/blob/main/LICENSE`, external: true },
        { label: 'NEAR Hackathon', href: `${REPO}#hackathon-context`, external: true },
      ],
    },
  ]

  return (
    <footer className="site-footer relative isolate overflow-hidden border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 pt-14 pb-10 sm:px-6 md:pt-20 md:pb-12">
        <div className="grid gap-12 md:grid-cols-[1fr_auto] md:gap-16">
          <div className="min-w-0">
            <a href={home || '#'} className="-ml-1 inline-flex h-11 items-center gap-2.5 rounded-lg px-1" aria-label="Terra home">
              <img src={ICON} alt="" className="size-8 rounded-[8px]" />
              <span className="text-[22px] font-medium tracking-[-0.03em]">terra</span>
            </a>

            <div className="mt-3 -ml-3 flex items-center">
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                aria-label="Terra on GitHub"
                className="flex size-11 items-center justify-center rounded-lg text-mute transition-colors hover:text-ink focus-visible:outline-ink"
              >
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
                  <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
                </svg>
              </a>
            </div>

            <p className="mt-3 max-w-[300px] text-[14px] leading-relaxed text-mute">The members' app for community treasuries.</p>
            <span className="mt-5 inline-flex rounded-full border border-line px-2 py-0.5 text-[11.5px] text-mute">NEAR testnet</span>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:gap-x-14">
            {columns.map((col) => (
              <div key={col.title} className="min-w-0">
                <h2 className="text-[13.5px] font-medium text-ink">{col.title}</h2>
                <ul className="mt-2">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                        className="-mx-1 flex min-h-11 items-center rounded-md px-1 text-[13.5px] text-mute transition-colors hover:text-ink focus-visible:outline-ink md:min-h-9"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 border-t border-line pt-6 md:mt-16">
          <p className="text-[13px] text-ink/80">© 2026 Terra contributors</p>
          <p className="mt-2 max-w-[720px] text-[12px] leading-relaxed text-mute">
            Terra is an open-source (MIT) members' app for community treasuries on a Sputnik DAO: members chip in, ask for money and approve payouts, built for the NEAR Hackathon.
          </p>
        </div>
      </div>
    </footer>
  )
}
