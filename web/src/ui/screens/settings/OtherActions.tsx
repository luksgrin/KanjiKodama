/**
 * Settings → "Other actions" (`preferences.xml` category `about`, `PreferencesFragment`): About this
 * app, Data import / export, Reset UI confirmations and tutorials, Reset database, Backup your
 * settings, Restore your settings, with the Java titles, summaries, dialogs and toasts. "Support and
 * feedback" is hidden as in Java (`LocalMode`). The web build adds "Known limitations" (Android has
 * none, so the row is not shown there).
 *
 * `DataImportExportPage` is `DataImportExportActivity` (`activity_data_import_export.xml`), shown as
 * `/settings?screen=data_import_export`.
 */
import type { ReactNode } from 'react';
import { limitationsFor } from './limitations';
import { useApp, useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { toast } from '../../shell/toast';
import { loadPresets, savePreset } from '../browse/searchPresets';
import { loadStarRatings, setStarRatings } from '../../components/subject/starRatings';
import {
  SEARCH_PRESETS_FILE,
  STAR_RATINGS_FILE,
  parseSearchPresetsImport,
  parseStarRatingsImport,
  searchPresetsExportText,
  starRatingsExportText,
} from '../../../progress/dataExport';
import { RESET_DATABASE_WARNING_PARTS, resetLocalDatabase, resetServerDatabase } from '../../../progress/resetDatabase';
import { parseSettingsBackup, settingsBackupFileName, settingsBackupText } from '../../../progress/settingsBackup';
import { ServerStore } from '../../../sync/store';
import type { FilesApi, SaveResult } from '../../../platform';
import { errorMessage } from './progressFlow';
import { PrefCategory, PrefRow } from './SettingRows';
import type { Alerts } from './useAlerts';
import './data.css';

/** The sub-screen key of the data import/export page. */
export const DATA_IMPORT_EXPORT_SCREEN = 'data_import_export';
/** `android:label` of `DataImportExportActivity`. */
export const DATA_IMPORT_EXPORT_TITLE = 'Data import/export';
/** The TS-only sub-screen with this build's known limitations. */
export const LIMITATIONS_SCREEN = 'known_limitations';

function ResetDatabaseMessage() {
  return (
    <p className="kk-alert-message" data-testid="reset-database-message">
      {RESET_DATABASE_WARNING_PARTS.map((p, i): ReactNode => (typeof p === 'string' ? p : <b key={i}>{p.b}</b>))}
    </p>
  );
}

export function OtherActionsCategory({ alerts, onResetTutorials }: { alerts: Alerts; onResetTutorials(): void }) {
  const app = useApp();
  const nav = useNavigate();
  const { platform } = useReady();
  const no = { label: 'No', onClick: alerts.close };

  const resetDatabase = () => alerts.show({
    title: 'Reset database?',
    warning: true,
    testId: 'dialog-reset-database',
    onCancel: alerts.close,
    negative: no,
    positive: {
      label: 'Yes',
      onClick: () => {
        alerts.close();
        void (async () => {
          try {
            const s = app.get();
            if (s.mode === 'server') {
              await resetServerDatabase(app.db, new ServerStore(app.db, app.tokenStore()));
            } else {
              const content = s.content;
              if (!content) return;
              await resetLocalDatabase(app.db, { content: content.content, jlptKanji: content.jlptKanji, now: app.clock.now() });
            }
            await loadStarRatings(app.db);
            await app.reload(); // new learner (drops the session runtime); server mode syncs everything again
            nav(paths.dashboard(), { replace: true }); // goToMainActivity
          } catch (e) {
            alerts.message('Something went wrong', errorMessage(e));
          }
        })();
      },
    },
    children: <ResetDatabaseMessage />,
  });

  // Called straight from the tap on Yes: the file text is built synchronously (iOS user activation).
  const backup = () => alerts.show({
    title: 'Backup settings?',
    warning: true,
    message: 'Are you sure you want to backup your settings?',
    testId: 'dialog-backup-settings',
    onCancel: alerts.close,
    negative: no,
    positive: {
      label: 'Yes',
      onClick: () => {
        alerts.close();
        platform.files.saveText(settingsBackupFileName(new Date(app.clock.now())), settingsBackupText(app.get().prefs)).then(
          (r) => { if (r === 'saved') toast('Settings backed up successfully.'); },
          () => undefined, // Java: e.printStackTrace() only
        );
      },
    },
  });

  const restore = () => alerts.show({
    title: 'Restore settings?',
    warning: true,
    message: 'Are you sure you want to restore your settings?',
    testId: 'dialog-restore-settings',
    onCancel: alerts.close,
    negative: no,
    positive: {
      label: 'Yes',
      onClick: () => {
        alerts.close();
        void (async () => {
          try {
            const opened = await platform.files.openText();
            if (!opened) return;
            const settings = parseSettingsBackup(opened.text); // all or nothing, like BackupActivity
            for (const [key, value] of Object.entries(settings)) await app.setPreference(key, value);
            toast('Settings restored successfully.');
          } catch {
            // Java: e.printStackTrace() only, nothing restored
          }
        })();
      },
    },
  });

  const showLimitations = limitationsFor(platform.capabilities).length > 0;
  return (
    <PrefCategory title="Other actions" testId="category-about">
      <PrefRow title="About this app" testId="link-about" onClick={() => nav(paths.about())} />
      <PrefRow title="Data import / export" testId="link-data-import-export"
        onClick={() => nav(`${paths.settings()}?screen=${DATA_IMPORT_EXPORT_SCREEN}`)} />
      <PrefRow title="Reset UI confirmations and tutorials" testId="reset-tutorials" onClick={onResetTutorials} />
      <PrefRow title="Reset database" summary="Clear all data in the app" testId="reset-database" onClick={resetDatabase} />
      <PrefRow title="Backup your settings" summary="Backup your settings to a file" testId="backup-settings" onClick={backup} />
      <PrefRow title="Restore your settings" summary="Restore from a backup of your settings file" testId="restore-settings" onClick={restore} />
      {showLimitations && (
        <PrefRow title="Known limitations" summary="What this build of the app cannot do" testId="link-limitations"
          onClick={() => nav(`${paths.settings()}?screen=${LIMITATIONS_SCREEN}`)} />
      )}
    </PrefCategory>
  );
}

/** Java exports with `ACTION_SEND` (the share sheet); builds without one use the save picker. */
function share(files: FilesApi, name: string, text: string): Promise<SaveResult> {
  return files.shareText ? files.shareText(name, text) : files.saveText(name, text);
}

export function DataImportExportPage() {
  const app = useApp();
  const { platform, content } = useReady();
  const files = platform.files;
  const failed = () => toast('Import failed');

  const exportPresets = async () => {
    try {
      await share(files, SEARCH_PRESETS_FILE, searchPresetsExportText(await loadPresets(app.db)));
    } catch {
      // Java: the IOException ends the click handler (`safe`)
    }
  };

  const importPresets = async () => {
    let opened;
    try {
      opened = await files.openText();
    } catch {
      return;
    }
    if (!opened) return;
    try {
      for (const p of parseSearchPresetsImport(opened.text)) await savePreset(app.db, p);
      toast('Import finished');
    } catch {
      failed();
    }
  };

  const exportStars = async () => {
    try {
      await share(files, STAR_RATINGS_FILE, starRatingsExportText(await loadStarRatings(app.db)));
    } catch {
      // as above
    }
  };

  const importStars = async () => {
    let opened;
    try {
      opened = await files.openText();
    } catch {
      return;
    }
    if (!opened) return;
    try {
      const known = new Set(content.content.subjects.map((s) => s.id));
      // `SubjectDao.updateStars` updates existing subject rows only.
      for (const [stars, ids] of parseStarRatingsImport(opened.text)) await setStarRatings(app.db, ids.filter((id) => known.has(id)), stars);
      toast('Import finished');
    } catch {
      failed();
    }
  };

  return (
    <div className="kk-data-page" data-testid="data-import-export">
      <p className="kk-data-large">Here you can import or export some data that is not stored on the WK servers.</p>
      <p className="kk-data-normal">Note that imports will add to or overwrite existing data, but won&apos;t remove existing data.</p>
      <div className="kk-data-buttons">
        <button type="button" className="kk-btn" data-testid="export-search-presets" onClick={() => void exportPresets()}>Export search presets</button>
        <button type="button" className="kk-btn" data-testid="import-search-presets" onClick={() => void importPresets()}>Import search presets</button>
        <button type="button" className="kk-btn" data-testid="export-star-ratings" onClick={() => void exportStars()}>Export star ratings</button>
        <button type="button" className="kk-btn" data-testid="import-star-ratings" onClick={() => void importStars()}>Import star ratings</button>
      </div>
    </div>
  );
}
