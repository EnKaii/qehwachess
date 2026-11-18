import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/** Profile page: lets a player ask for permission to organize tournaments. */
export function OrganizerAccessCard() {
  const { t } = useLanguage();
  const { profile, refreshProfile } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile || profile.role === 'admin') return null;

  async function request() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('request_organizer_access', { p_note: note });
    if (rpcError) setError(rpcError.message);
    else await refreshProfile();
    setBusy(false);
  }

  const status = profile.organizer_request_status;
  return (
    <Card className="mb-6 p-6">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 text-brand-400" />
        <div className="flex-1">
          <h2 className="font-semibold text-white">{t('Organizing tournaments')}</h2>
          {profile.can_organize ? (
            <p className="mt-1 text-sm text-success-300">{t('You are an approved organizer. Create tournaments from your organizer panel.')}</p>
          ) : status === 'pending' ? (
            <p className="mt-1 text-sm text-amber-300">{t('Your request is waiting for an administrator.')}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500">
                {status === 'rejected' ? t('Your last request was declined. You can ask again.') : t('Want to run tournaments? Ask an administrator for organizer access. You can keep playing as usual.')}
              </p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300}
                placeholder={t('Tell us briefly about your club or event (optional)')}
                className="mt-3 w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white" />
              <Button className="mt-3" onClick={() => void request()} disabled={busy}>{busy ? t('Sending...') : t('Request organizer access')}</Button>
            </>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-error-400">{error}</p>}
        </div>
      </div>
    </Card>
  );
}

interface Request { id: string; full_name: string; email: string; organizer_request_note: string | null; organizer_requested_at: string | null }

/** Admin dashboard: pending organizer requests. */
export function OrganizerRequestsPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Request[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, full_name, email, organizer_request_note, organizer_requested_at')
      .eq('organizer_request_status', 'pending')
      .order('organizer_requested_at');
    if (loadError) setError(loadError.message);
    else setRows((data ?? []) as Request[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function review(id: string, approve: boolean) {
    setError(null);
    const { error: rpcError } = await supabase.rpc('review_organizer_request', { p_user_id: id, p_approve: approve });
    if (rpcError) setError(rpcError.message);
    await load();
    onChanged?.();
  }

  return (
    <Card className="p-6 lg:col-span-2">
      <h2 className="mb-4 font-semibold text-white">{t('Organizer requests')} ({rows.length})</h2>
      {error && <p role="alert" className="mb-3 text-sm text-error-400">{error}</p>}
      {rows.length === 0 ? <p className="text-sm text-gray-500">{t('No pending requests.')}</p> : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-800/70 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{r.full_name}</p>
                <p className="truncate text-xs text-gray-500">{r.email}</p>
                {r.organizer_request_note && <p className="mt-1 text-xs text-gray-400">“{r.organizer_request_note}”</p>}
              </div>
              <Button size="sm" onClick={() => void review(r.id, true)}><Check className="h-4 w-4" />{t('Approve')}</Button>
              <Button size="sm" variant="outline" onClick={() => void review(r.id, false)}><X className="h-4 w-4" />{t('Decline')}</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
