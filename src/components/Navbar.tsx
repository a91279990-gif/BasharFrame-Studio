import { Translations } from '../utils/i18n';

interface NavbarProps {
  t: Translations;
}

export function Navbar({ t }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0B0B0E]/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Website name strictly in English with rotating outer chroma ring */}
        <a
          href="#studio"
          className="chroma-text-ring chroma-text-glow rounded-xl px-3.5 py-1.5 font-display text-base sm:text-lg font-semibold tracking-tight text-zinc-50 whitespace-nowrap shrink-0"
          style={{ ['--ring-bg' as string]: '#0E0E13' }}
        >
          Bashar Frame Studio
        </a>

        {/* Zone 2: Clean Bengali navigation links without outer color rings */}
        <nav className="flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-400">
          <a
            href="#studio"
            className="rounded-lg px-3 py-1.5 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0"
          >
            {t.navStudio}
          </a>
          <a
            href="#workflow"
            className="rounded-lg px-3 py-1.5 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0"
          >
            {t.navGuide}
          </a>
        </nav>
      </div>
    </header>
  );
}
