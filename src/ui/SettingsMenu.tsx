import { useState, type ReactNode } from 'react';
import { GRAPHICS_PRESETS, type GraphicsPresetId } from '../config/graphics';
import { CAR_COLORS, createDefaultSettings, type Settings } from '../config/settings';

type Tab = 'audio' | 'graphics' | 'controls' | 'comfort' | 'atmosphere';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Slider(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; label: string }) {
  return (
    <span className="slider">
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output>{props.format ? props.format(props.value) : props.value.toFixed(2)}</output>
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SettingsMenu({ settings, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('audio');
  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) =>
    onChange({ ...settings, [key]: { ...(settings[key] as object), ...patch } } as Settings);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'audio', label: 'Audio' },
    { id: 'graphics', label: 'Graphics' },
    { id: 'controls', label: 'Driving' },
    { id: 'comfort', label: 'Comfort' },
    { id: 'atmosphere', label: 'Liminal' },
  ];

  return (
    <section className="panel settings-panel" aria-label="Settings">
      <header className="panel-header">
        <h2>Settings</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-body" role="tabpanel">
        {tab === 'audio' && (
          <>
            {(
              [
                ['master', 'Master volume'],
                ['vehicle', 'Vehicle', 'Engine, tyres, wind rush'],
                ['ambience', 'Environment ambience'],
                ['music', 'Music', 'Slow generative pads'],
                ['horror', 'Liminal sounds', 'Distant, sourceless noises'],
              ] as [keyof Settings['audio'], string, string?][]
            ).map(([k, label, hint]) => (
              <Row key={k} label={label} hint={hint}>
                <Slider label={label} value={settings.audio[k]} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('audio', { [k]: v })} />
              </Row>
            ))}
            <p className="settings-note">All sound is synthesised live in your browser — nothing is streamed.</p>
          </>
        )}
        {tab === 'graphics' && (
          <>
            <Row label="Quality preset" hint={GRAPHICS_PRESETS[settings.graphics.preset].description}>
              <Segmented<GraphicsPresetId>
                label="Quality preset"
                value={settings.graphics.preset}
                options={[
                  { id: 'low', label: 'Low' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'high', label: 'High' },
                ]}
                onChange={(preset) => set('graphics', { preset })}
              />
            </Row>
            <Row label="Render resolution" hint="Lower is faster on high-DPI screens">
              <Slider label="Render resolution" value={settings.graphics.resolutionScale} min={0.5} max={1.5} step={0.05} format={pct} onChange={(v) => set('graphics', { resolutionScale: v })} />
            </Row>
            <Row label="Adaptive resolution" hint="Gently lowers resolution after sustained slowdowns">
              <Toggle label="Adaptive resolution" checked={settings.graphics.adaptiveResolution} onChange={(v) => set('graphics', { adaptiveResolution: v })} />
            </Row>
            <Row label="Performance overlay">
              <Toggle label="Performance overlay" checked={settings.graphics.showPerformance} onChange={(v) => set('graphics', { showPerformance: v })} />
            </Row>
          </>
        )}
        {tab === 'controls' && (
          <>
            <Row label="Top speed" hint="Some places have their own limit">
              <Slider
                label="Top speed"
                value={settings.controls.maxSpeedKmh}
                min={40}
                max={200}
                step={5}
                format={(v) => (settings.controls.units === 'mph' ? `${Math.round(v * 0.621)} mph` : `${v} km/h`)}
                onChange={(v) => set('controls', { maxSpeedKmh: v })}
              />
            </Row>
            <Row label="Steering sensitivity">
              <Slider label="Steering sensitivity" value={settings.controls.steeringSensitivity} min={0.6} max={1.5} step={0.05} format={pct} onChange={(v) => set('controls', { steeringSensitivity: v })} />
            </Row>
            <Row label="Camera sensitivity" hint="Mouse / touch drag to look around">
              <Slider label="Camera sensitivity" value={settings.controls.cameraSensitivity} min={0.2} max={2.5} step={0.05} format={pct} onChange={(v) => set('controls', { cameraSensitivity: v })} />
            </Row>
            <Row label="Field of view">
              <Slider label="Field of view" value={settings.controls.fov} min={50} max={85} step={1} format={(v) => `${v}°`} onChange={(v) => set('controls', { fov: v })} />
            </Row>
            <Row label="Speed units">
              <Segmented label="Speed units" value={settings.controls.units} options={[{ id: 'kmh', label: 'km/h' }, { id: 'mph', label: 'mph' }]} onChange={(units) => set('controls', { units })} />
            </Row>
            <Row label="Car colour">
              <div className="swatches" role="radiogroup" aria-label="Car colour">
                {CAR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.vehicle.color === c.id}
                    aria-label={c.name}
                    title={c.name}
                    className={`swatch${settings.vehicle.color === c.id ? ' is-active' : ''}`}
                    style={{ background: c.id }}
                    onClick={() => set('vehicle', { color: c.id })}
                  />
                ))}
              </div>
            </Row>
          </>
        )}
        {tab === 'comfort' && (
          <>
            <Row label="Reduce motion" hint="No camera lean or speed FOV kick">
              <Toggle label="Reduce motion" checked={settings.comfort.reduceMotion} onChange={(v) => set('comfort', { reduceMotion: v })} />
            </Row>
            <Row label="Show HUD" hint="H toggles it while driving">
              <Toggle label="Show HUD" checked={settings.comfort.showHud} onChange={(v) => set('comfort', { showHud: v })} />
            </Row>
            <Row label="Show drive time">
              <Toggle label="Show drive time" checked={settings.comfort.showDriveTime} onChange={(v) => set('comfort', { showDriveTime: v })} />
            </Row>
            <Row label="Drifting time & weather" hint="Slowly cycles through each place's moods">
              <Toggle label="Drifting time and weather" checked={settings.atmosphere.timeDrift} onChange={(v) => set('atmosphere', { timeDrift: v })} />
            </Row>
          </>
        )}
        {tab === 'atmosphere' && (
          <>
            <Row label="Liminal events" hint="Rare, quiet oddities. Never jump-scares.">
              <Segmented
                label="Liminal events"
                value={settings.atmosphere.liminal}
                options={[
                  { id: 'off', label: 'Off' },
                  { id: 'subtle', label: 'Subtle' },
                  { id: 'uncanny', label: 'Uncanny' },
                ]}
                onChange={(liminal) => set('atmosphere', { liminal })}
              />
            </Row>
            <Row label="Visual anomalies" hint="Figures, distant lights, a flicker">
              <Toggle label="Visual anomalies" checked={settings.atmosphere.visualAnomalies} onChange={(v) => set('atmosphere', { visualAnomalies: v })} />
            </Row>
            <Row label="Liminal audio" hint="Sounds with no obvious source">
              <Toggle label="Liminal audio" checked={settings.atmosphere.horrorAudio} onChange={(v) => set('atmosphere', { horrorAudio: v })} />
            </Row>
            <Row label="Atmospheric shifts" hint="Fog that thickens, ambience that falls silent">
              <Toggle label="Atmospheric shifts" checked={settings.atmosphere.atmosphericEffects} onChange={(v) => set('atmosphere', { atmosphericEffects: v })} />
            </Row>
          </>
        )}
      </div>
      <footer className="panel-footer">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const d = createDefaultSettings();
            onChange({ ...d, last: settings.last });
          }}
        >
          Reset to defaults
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </footer>
    </section>
  );
}
