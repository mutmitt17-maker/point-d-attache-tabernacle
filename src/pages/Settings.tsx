import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface SettingsRow {
  church_id: string;
  require_payment_validation: boolean;
  allow_overpayment_default: boolean;
  gps_enabled: boolean;
}

export default function Settings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile?.church_id) return;
    supabase
      .from('settings')
      .select('church_id,require_payment_validation,allow_overpayment_default,gps_enabled')
      .eq('church_id', profile.church_id)
      .maybeSingle()
      .then(({ data }) => setSettings((data as SettingsRow) ?? { church_id: profile.church_id, require_payment_validation: false, allow_overpayment_default: false, gps_enabled: false }));
  }, [profile?.church_id]);

  async function save() {
    if (!settings) return;
    await supabase.from('settings').upsert(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!settings) return <p>Chargement…</p>;

  return (
    <>
      <header>
        <div>
          <h1>Paramètres</h1>
          <p>Règles générales appliquées à toute l'église.</p>
        </div>
      </header>

      <section className="panel">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.require_payment_validation}
            onChange={(e) => setSettings({ ...settings, require_payment_validation: e.target.checked })}
          />
          Exiger une validation administrative avant qu'un encaissement ne compte dans les totaux
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.allow_overpayment_default}
            onChange={(e) => setSettings({ ...settings, allow_overpayment_default: e.target.checked })}
          />
          Autoriser par défaut le dépassement de souscription sur les nouvelles campagnes
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.gps_enabled} onChange={(e) => setSettings({ ...settings, gps_enabled: e.target.checked })} />
          Activer la position GPS facultative lors des encaissements
        </label>
        {saved && <p className="form-info">Paramètres enregistrés.</p>}
        <button className="primary" onClick={save}>
          Enregistrer
        </button>
      </section>
    </>
  );
}
