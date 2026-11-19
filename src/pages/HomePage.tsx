import { useMemo } from 'react';
import { LandingStory } from '@/components/landing/LandingStory';
import { Link } from '@/context/RouterContext';
import { useTournaments } from '@/hooks/useData';
import { TournamentCard } from '@/components/TournamentCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Feedback';
import {
  Trophy,
  MapPin,
  ArrowRight,
  Calendar,
  Building2,
  Search,
} from 'lucide-react';
import { getDaysUntil, formatDateRange, tournamentFormatLabels } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';


function SectionTitle({ ar, title, sub, center = false }: { ar: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'text-center' : ''}>
      <div className={`flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
        <span className="text-xl text-accent-400" style={{ fontFamily: "'Reem Kufi', sans-serif" }}>{ar}</span>
        <span className="h-2 w-2 rotate-45 bg-accent-400" /><span className="h-px w-12 bg-accent-400/50" />
      </div>
      <h2 className="mt-2 text-2xl font-bold uppercase tracking-[0.06em] text-white sm:text-3xl">{title}</h2>
      {sub && <p className="mt-1 text-gray-500">{sub}</p>}
    </div>
  );
}

export function HomePage() {
  const { t, language } = useLanguage();
  const translate = t;
  const { tournaments, loading } = useTournaments();

  const featured = useMemo(
    () => tournaments.filter((t) => t.featured).slice(0, 4),
    [tournaments]
  );
  const upcoming = useMemo(
    () =>
      tournaments
        .filter((t) => getDaysUntil(t.start_date) >= 0)
        .sort((a, b) => getDaysUntil(a.start_date) - getDaysUntil(b.start_date))
        .slice(0, 3),
    [tournaments]
  );


  return (
    <div className="min-h-screen">
      <LandingStory />
      <div className="checker-edge" aria-hidden="true" />

      {(loading || featured.length > 0) && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <SectionTitle ar="بطولات مميزة" title={t('Featured Tournaments')} sub={t("Hand-picked events you don't want to miss")} />
          </div>
          <Link to={{ name: 'tournaments' }}>
            <Button variant="ghost" size="sm">
              {t('View all')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <PageLoader />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((t, i) => (
              <div key={t.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <TournamentCard tournament={t} />
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Upcoming */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <SectionTitle ar="قريبًا" title={t('Happening Soon')} sub={t('Next tournaments across Morocco')} />
            <Link to={{ name: 'tournaments' }}>
              <Button variant="outline" size="sm" className="mt-4">
                {t('See all upcoming')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-4">
            {upcoming.length === 0 && (
              <Card className="p-8 text-center border-t-2 border-t-accent-400/60">
                <p className="text-gray-400">{t('No upcoming tournaments yet.')}</p>
                <Link to={{ name: 'signup' }}><Button className="mt-4">{t('Become an Organizer')}</Button></Link>
              </Card>
            )}
            {upcoming.map((t) => {
              const days = getDaysUntil(t.start_date);
              return (
                <Link key={t.id} to={{ name: 'tournament', id: t.id }}>
                  <Card hover className="p-5 flex items-center gap-5 group cursor-pointer">
                    {/* Date block */}
                    <div className="flex-shrink-0 w-16 text-center">
                      <div className="text-3xl font-bold text-brand-400">{days === 0 ? translate('NOW') : days}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{days === 0 ? '' : days === 1 ? translate('day') : translate('days')}</div>
                    </div>
                    <div className="w-px h-12 bg-surface-700" />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                        {t.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {t.city?.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDateRange(t.start_date, t.end_date, language)}
                        </span>
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1">
                      <span className="text-xs text-brand-300 font-medium">{tournamentFormatLabels[t.format]}</span>
                      {t.club && <span className="text-xs text-gray-500">{t.club.name}</span>}
                    </div>
                    <ArrowRight className="w-5 h-5 text-surface-600 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-12"><SectionTitle center ar="الشطرنج المحلي" title={t('Everything for local chess')} sub={t('Find players, places, and events in one place')} /></div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Search,
              title: t('Meetups near you'),
              desc: t('Find a casual game at a local café, park, or club and make plans with nearby players.'),
            },
            {
              icon: Building2,
              title: t('Tournaments and clubs'),
              desc: t('Discover local clubs and upcoming events, then register and keep the details together.'),
            },
            {
              icon: Trophy,
              title: t('Player profiles'),
              desc: t('Browse players, connect over chess, and message before you meet across the board.'),
            },
          ].map((feature, i) => (
            <Card key={i} className="p-8 animate-fade-in-up border-t-2 border-t-accent-400/60" >
              <div className="w-12 h-14 rounded-t-full rounded-b-md bg-brand-500/10 border border-brand-500/30 flex items-center justify-center mb-5">
                <feature.icon className="w-6 h-6 text-brand-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10">
          <SectionTitle ar="كيف يعمل" title={t('How it works')} />
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { title: t('Choose your city'), description: t('Set up your player profile and find chess happening near you.') },
            { title: t('Find your game'), description: t('Browse meetups, clubs, and tournaments that fit your schedule.') },
            { title: t('Meet and play'), description: t('Message players, make a plan, and enjoy chess face to face.') },
          ].map((step, index) => (
            <div key={step.title} className="border-t-2 border-accent-400/50 pt-5">
              <span className="text-4xl text-accent-400" style={{ fontFamily: "'Reem Kufi', sans-serif" }}>{['١', '٢', '٣'][index]}</span>
              <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card className="relative overflow-hidden p-10 sm:p-16 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 via-transparent to-accent-500/10" />
          <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'var(--zellige)' }} />
          <div className="relative">
            <h2 className="text-2xl sm:text-4xl font-bold text-white max-w-2xl mx-auto text-balance">
              {t('Are you organizing a chess tournament?')}
            </h2>
            <p className="text-gray-400 mt-4 max-w-xl mx-auto">
              {t('Publish your tournament on Qehwa Chess and reach players across Morocco. Manage registrations and grow your event.')}
            </p>
            <Link to={{ name: 'signup' }}>
              <Button size="lg" className="mt-8">
                {t('Become an Organizer')}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
