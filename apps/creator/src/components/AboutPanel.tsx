/** About dialog — styled like entropia-riko's AboutPanel (floating
 * window: logo hero, name, version, description, meta table). */
import { APP_VERSION } from "../version";
import { useCreatorStore } from "../state/sceneStore";

export function AboutPanel() {
  const aboutOpen = useCreatorStore((s) => s.aboutOpen);
  const closeAbout = useCreatorStore((s) => s.closeAbout);
  if (!aboutOpen) return null;

  return (
    <div className="about-overlay" onClick={closeAbout}>
      <div className="about-window" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <span className="about-title">About Atmos</span>
          <button className="panel-btn" onClick={closeAbout}>✕</button>
        </div>
        <div className="about-hero">
          <img src="/brand/logo.png" alt="Atmos logo" className="about-logo" />
          <h2>Atmos</h2>
          <div className="about-version">Version {APP_VERSION}</div>
        </div>
        <div className="about-body">
          <p className="about-desc">
            An AI + computer-graphics inspired spatial audio engine — the
            "Blender for spatial audio". Represent acoustic scenes, simulate
            sound propagation, shade materials with acoustic node graphs,
            and render binaural audio in real time.
          </p>
          <table className="about-meta">
            <tbody>
              <tr><td>Core</td><td>AudioGS · Audio-USD · Acoustic-BRDF · HRTF</td></tr>
              <tr><td>Solvers</td><td>image-source · ray-tracing · splat-field</td></tr>
              <tr><td>Formats</td><td>.audio_usd.json (scene) · WAV · OBJ</td></tr>
              <tr><td>Targets</td><td>Standalone · VST3 · AU</td></tr>
              <tr><td>License</td><td>MIT</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
