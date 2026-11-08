/**
 * Pitch accent of one reading, like the Java `PitchInfoView`: per record a dot diagram (high/low per
 * mora plus a hollow dot for the following particle, colored by pattern) with the label
 * `[n] 平板 (part of speech)`, then the reading itself, whose kana line up with the dots.
 *
 * Java: `views/PitchInfoView`, `views/PitchInfoDiagramView` (dots 3 dp, lines 2 dp, text size + 4).
 */
import './subject.css';
import { moraEnds, pitchDots, pitchKind, pitchLabel, type PitchInfo } from './pitchInfo';

export interface PitchAccentProps {
  /** The reading as WaniKani writes it (hiragana). */
  kana: string;
  infos: readonly PitchInfo[];
  /** Font size in px of the reading and labels (Java: subject info size + 4 = 20 by default). */
  fontSize?: number;
}

const DOT_RADIUS = 3;
const LINE_WIDTH = 2;

function PitchDiagram({ kana, pitchNumber, fontSize }: { kana: string; pitchNumber: number; fontSize: number }) {
  const dots = pitchDots(kana, pitchNumber);
  const kind = pitchKind(pitchNumber, moraEnds(kana).length);
  const height = Math.round(fontSize * 1.2);
  const width = Math.ceil((kana.length + 1) * fontSize + DOT_RADIUS * 2);
  const pts = dots.map((d) => [d.x * fontSize, d.high ? DOT_RADIUS : height - DOT_RADIUS] as const);
  return (
    <svg
      className={`kk-pitch-diagram kk-pitch--${kind}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" strokeWidth={LINE_WIDTH} className="kk-pitch-line" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={DOT_RADIUS} className={dots[i]!.hollow ? 'kk-pitch-dot kk-pitch-dot--hollow' : 'kk-pitch-dot'} />
      ))}
    </svg>
  );
}

/** Pitch accent diagrams and labels for one reading. */
export function PitchAccent({ kana, infos, fontSize = 20 }: PitchAccentProps) {
  const numMora = moraEnds(kana).length;
  return (
    <div className="kk-pitch" style={{ fontSize }}>
      {infos.map((info, i) => (
        <div key={i} className="kk-pitch-row">
          <PitchDiagram kana={kana} pitchNumber={info.pitchNumber} fontSize={fontSize} />
          <span lang="ja" className="kk-ja kk-pitch-label">
            {pitchLabel(info, numMora)}
          </span>
        </div>
      ))}
      <div lang="ja" className="kk-ja kk-pitch-kana">
        {kana}
      </div>
    </div>
  );
}
