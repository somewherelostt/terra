import LanguagePicker from './LanguagePicker'
import { ThemeButton } from './AccountMenu'
import { useT } from '../i18n'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`
export const REPO = 'https://github.com/somewherelostt/terra'

/** The GitHub mark, in currentColor. */
export function GitHubMark({ className = 'size-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

/**
 * The public site footer: landing page, public board and docs. Not used inside the signed-in app.
 * Short on purpose: brand, a few links, one status line, and a large faded wordmark over the blue haze.
 * `home` prefixes in-page links ('' on the landing, './' elsewhere); `boardUrl` is the live demo board.
 */
export default function SiteFooter({ home = '', boardUrl }: { home?: string; boardUrl: string }) {
  const t = useT()
  const links: [string, string][] = [
    [t('footer.how'), `${home}#how`],
    [t('footer.board'), boardUrl],
    [t('footer.docs'), `${home}#/docs`],
  ]
  const link = 'flex min-h-11 items-center rounded-md px-2 text-mute transition-colors hover:text-ink focus-visible:outline-ink'

  return (
    <footer className="site-footer relative isolate overflow-hidden border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6 md:pt-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <a href={home || '#'} className="-ml-1 inline-flex h-11 items-center gap-2.5 rounded-lg px-1 focus-visible:outline-ink" aria-label={t('footer.homeLabel')}>
              <img src={ICON} alt="" className="size-7 rounded-[7px]" />
              <span className="text-[18px] font-medium tracking-[-0.03em]">terra</span>
            </a>
            <p className="mt-1 text-[14px] text-mute">{t('footer.tagline')}</p>
          </div>

          <nav aria-label={t('footer.navLabel')} className="-mx-2 flex flex-wrap items-center text-[13.5px]">
            {links.map(([label, href]) => (
              <a key={label} href={href} className={link}>{label}</a>
            ))}
            <a href={REPO} target="_blank" rel="noreferrer" aria-label={t('footer.github')} className={`${link} min-w-11 justify-center`}>
              <GitHubMark />
            </a>
          </nav>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 text-[12.5px] text-mute">
          <span>{t('footer.copyright', { year: '2026' })}</span>
          <div className="flex items-center gap-1">
            <LanguagePicker up align="end-md" />
            <ThemeButton />
          </div>
        </div>
      </div>

      {/* Large faded wordmark, cropped by the bottom edge. Decorative. */}
      <div aria-hidden className="site-footer-mark mx-auto max-w-[1200px] px-4 sm:px-6">terra</div>
    </footer>
  )
}
