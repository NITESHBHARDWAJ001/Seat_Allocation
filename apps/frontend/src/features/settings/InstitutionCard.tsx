import { useEffect, useState } from 'react';
import { DEFAULT_INSTITUTION, type InstitutionProfile } from '../../vendor/core/index.js';
import { getInstitution, saveInstitution } from '../../services/attendanceService.js';

/** Details printed on attendance sheets and answer-book memos. */
export default function InstitutionCard() {
  const [profile, setProfile] = useState<InstitutionProfile>(DEFAULT_INSTITUTION);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getInstitution().then(setProfile);
  }, []);

  const field = (key: keyof InstitutionProfile, label: string, placeholder = '') => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="input mt-1"
        value={profile[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          setSaved(false);
          setProfile({ ...profile, [key]: e.target.value });
        }}
      />
    </label>
  );

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="font-semibold text-slate-900">Institution (printed on memos and attendance sheets)</div>
        <div className="text-xs text-slate-500">Stored in this browser. Used for the header and the centre superintendent block.</div>
      </div>
      {field('university', 'University')}
      {field('universityTagline', 'Tagline under the university name')}
      {field('college', 'College', 'e.g. S.I.E.T., Nilokheri')}
      {field('centreNo', 'Centre No.', 'e.g. A-420')}
      {field('superintendent', 'Centre Superintendent (optional)')}
      <div className="text-sm">
        <span className="text-slate-600">University emblem (optional, printed left of the memo header)</span>
        <div className="mt-1 flex items-center gap-3">
          {profile.logo && <img src={profile.logo} alt="" className="h-12 w-12 object-contain border border-slate-200 rounded" />}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setSaved(false);
                setProfile((p) => ({ ...p, logo: String(reader.result) }));
              };
              reader.readAsDataURL(file);
            }}
          />
          {profile.logo && (
            <button className="btn-ghost" onClick={() => setProfile({ ...profile, logo: undefined })}>
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          onClick={async () => {
            await saveInstitution(profile);
            setSaved(true);
          }}
        >
          Save
        </button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </div>
  );
}
