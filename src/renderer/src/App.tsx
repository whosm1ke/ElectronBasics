// App.tsx — the React root. During the strangler-fig migration (see
// CLAUDE.md-to-be / the migration plan) this coexists with the original
// app.js + modules/*.js, taking over one feature at a time; each ported
// piece is added here and its old module deleted/shimmed in the same
// change. Currently owns: the toast host, and the History/Variables/Details
// modals (each renders its own full overlay — index.html no longer has
// static markup for these three, unlike the inline-content pieces mounted
// separately by legacyMounts.tsx).
import { Toast } from './components/shared/Toast';
import { HistoryDrawer } from './components/Modals/HistoryDrawer';
import { VariablesModal } from './components/Modals/VariablesModal';
import { DetailsModal } from './components/Modals/DetailsModal';
import { EditorModal } from './components/Modals/EditorModal';
import { GroupsModal } from './components/Modals/GroupsModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { BatchModal } from './components/Modals/BatchModal';
import { PipelinesModal } from './components/Modals/PipelinesModal';

export function App() {
  return (
    <>
      <Toast />
      <HistoryDrawer />
      <VariablesModal />
      <DetailsModal />
      <EditorModal />
      <GroupsModal />
      <SettingsModal />
      <BatchModal />
      <PipelinesModal />
    </>
  );
}
