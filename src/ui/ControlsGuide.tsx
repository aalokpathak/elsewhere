import { CONTROLS_GUIDE } from '../config/controls';

export function ControlsGuide({ touch }: { touch?: boolean }) {
  return (
    <div className="controls-guide">
      <dl className="controls-list">
        {CONTROLS_GUIDE.map((c) => (
          <div key={c.action} className="controls-row">
            <dt>
              {c.keys.split(' ').map((k, i) =>
                k === '/' ? (
                  <span key={i} className="kbd-sep">/</span>
                ) : (
                  <kbd key={i}>{k}</kbd>
                ),
              )}
            </dt>
            <dd>{c.action}</dd>
          </div>
        ))}
      </dl>
      {touch && (
        <p className="controls-note">
          On touch screens: steer with the left-hand pads, accelerate and brake on the right. Both can be held at once.
        </p>
      )}
      <p className="controls-note">A gamepad also works: left stick steers, right trigger accelerates, left trigger brakes.</p>
    </div>
  );
}
