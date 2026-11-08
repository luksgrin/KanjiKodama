/**
 * Keyboard help: six HTML text blocks with 8 px padding; under the intro a "Keyboard settings" button,
 * under the next four a row (8 px padding) with "Do it" and "Keyboard settings". "Do it" changes the keyboard
 * settings as the text recommends and confirms with "Keyboard settings updated". "Keyboard settings"
 * opens the Keyboard input settings sub-screen (`goToPreferencesActivity("keyboard_settings")`).
 *
 * The blocks render as `Html.fromHtml` does: h3/h4 bold at 1.3/1.2 em, `<br/>` a blank line, list
 * items as "• text".
 */
import { Fragment, useState, type ReactNode } from 'react';
import type { PreferenceValue } from '../../../core/settings';
import { useApp } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useToolbar } from '../../shell/toolbar';
import { AlertDialog } from '../settings/AlertDialog';
import './keyboardHelp.css';

const APP_NAME = 'KanjiKodama';

interface Block {
  heading: string;
  level: 3 | 4;
  /** Paragraphs and lists in order (`<br/><br/>` between them). */
  body: readonly (string | readonly string[])[];
}

/** `KEYBOARD_HELP_DOCUMENT_INTRO` and `_1` … `_5`. */
export const KEYBOARD_HELP: readonly Block[] = [
  {
    heading: `Welcome to ${APP_NAME}!`,
    level: 3,
    body: [
      `To get the most out of this app, it's important that your keyboard will work well with it. You can use any keyboard with ${APP_NAME}, `
        + "but you may need to tweak a few app settings for your specific keyboard. Please don't hesitate to try different keyboard settings.",
    ],
  },
  {
    heading: 'If you are using Swiftkey',
    level: 4,
    body: [
      `Swiftkey has a few annoying bugs. To get Swiftkey to work properly with ${APP_NAME}, I recommend these app settings:`,
      ["Enable 'visible password' for both meanings and readings", "Don't allow auto-correct", "Disable 'no personalized learning'"],
    ],
  },
  {
    heading: 'If your keyboard is giving you inappropriate hints',
    level: 4,
    body: [
      `This is probably because of auto-suggest or auto-correct. ${APP_NAME} tries to prevent this, but some keyboards are buggy and don't respect that. `
        + 'To prevent this hinting, I recommend these settings:',
      ["Enable 'visible password' for both meanings and readings", "Don't allow auto-correct", "Enable 'no personalized learning'"],
    ],
  },
  {
    heading: 'If your keyboard offers to auto-fill passwords for you',
    level: 4,
    body: [
      "This is because of the 'visible password' setting. It prevents buggy keyboards from giving you hints, but it can also backfire. "
        + 'To prevent this auto-fill, I recommend these settings:',
      ["Disable 'visible password' for both meanings and readings"],
    ],
  },
  {
    heading: "If you can't use your own language keyboard (Hebrew, Russian, ...)",
    level: 4,
    body: [
      `This is probably because ${APP_NAME} asks for an ASCII keyboard for meaning questions. To fix this, I recommend these settings:`,
      ["Disable 'force ASCII keyboard' for meanings"],
    ],
  },
  {
    heading: 'I want to use my Kana keyboard for readings, and an ASCII keyboard for meanings',
    level: 4,
    body: [
      "This is not possible because of Google's security restrictions, but there is a workaround which may work for you:",
      'First of all, if you use Android 7.1 or later, you can enable a keyboard language hint in the keyboard settings. '
        + "When combined with the right settings for your keyboard, your keyboard may auto-switch languages. If that doesn't work:",
      [
        'Install a keyboard that has both an ASCII layout and a Kana layout, such as Gboard',
        "Enable 'force ASCII keyboard' for meanings, disable it for readings",
        "Enable 'visible password' for meanings, disable it for readings",
        'Start a review session',
        'On your first reading question, change to your Kana layout',
      ],
      'If the trick works, your keyboard will now automatically switch between Kana and ASCII for the rest of the session. '
        + "This trick doesn't work for every device, and it doesn't work for all keyboards, but it may work for you.",
    ],
  },
];

/** `doIt1` … `doIt4`: the settings each "Do it" button writes. */
export const DO_IT: readonly Readonly<Record<string, PreferenceValue>>[] = [
  {
    force_visible_password_meaning: true, force_visible_password_reading: true,
    enable_auto_correct_meaning: false, enable_auto_correct_reading: false, enable_no_learning: false,
  },
  {
    force_visible_password_meaning: true, force_visible_password_reading: true,
    enable_auto_correct_meaning: false, enable_auto_correct_reading: false, enable_no_learning: true,
  },
  { force_visible_password_meaning: false, force_visible_password_reading: false },
  { force_ascii_meaning: false },
];

function BlockView({ block, index }: { block: Block; index: number }) {
  const Heading = block.level === 3 ? 'h3' : 'h4';
  return (
    <div className={`kk-kbh-doc${index > 0 ? ' kk-kbh-gap' : ''}`} data-testid={`keyboard-help-${index}`}>
      <Heading>{block.heading}</Heading>
      {block.body.map((part, i): ReactNode => (typeof part === 'string'
        ? <p key={i}>{part}</p>
        : <ul key={i}>{part.map((li) => <li key={li}>{li}</li>)}</ul>))}
    </div>
  );
}

export function KeyboardHelpScreen() {
  const app = useApp();
  const nav = useNavigate();
  const [done, setDone] = useState(false);
  useToolbar({ title: 'Keyboard help' });

  const settings = () => nav(`${paths.settings()}?screen=keyboard_settings`);
  const doIt = (i: number) => {
    void Promise.all(Object.entries(DO_IT[i]!).map(([k, v]) => app.setPreference(k, v))).then(() => setDone(true));
  };
  const settingsButton = (n: number, standalone = false) => (
    <button type="button" className={`kk-btn${standalone ? ' kk-kbh-padded' : ''}`} data-testid={`keyboard-settings-${n}`} onClick={settings}>
      Keyboard settings
    </button>
  );

  return (
    <div className="kk-kbh" data-testid="keyboard-help">
      {KEYBOARD_HELP.map((block, i) => (
        <Fragment key={i}>
          <BlockView block={block} index={i} />
          {i === 0 && settingsButton(1, true)}
          {i >= 1 && i <= 4 && (
            <div className="kk-kbh-row">
              <button type="button" className="kk-btn" data-testid={`do-it-${i}`} onClick={() => doIt(i - 1)}>Do it</button>
              {settingsButton(i + 1)}
            </div>
          )}
        </Fragment>
      ))}
      <AlertDialog open={done} title="Keyboard settings updated" message="Your settings have been updated." testId="dialog-keyboard-updated"
        onCancel={() => setDone(false)} positive={{ label: 'OK', onClick: () => setDone(false) }} />
    </div>
  );
}
