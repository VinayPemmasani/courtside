import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Rule } from './core';
import { startCloud, store } from './storage/db';
import { CHANGED, cloudStatus, onCloudStatus, type CloudStatus } from './storage/cloud';
import { Library } from './components/Library';
import { ImportView } from './components/ImportView';
import { SessionView } from './components/SessionView';
import { CompareView } from './components/CompareView';
import { TrendsView } from './components/TrendsView';
import { RulesView } from './components/RulesView';
import { DrillsView } from './components/DrillsView';
import { StrikeStudy } from './components/StrikeLab';
import type { Handedness, StrokeType } from './core';

export type Route =
  | { name: 'library'; playerId?: string }
  | { name: 'import'; playerId: string }
  | { name: 'session'; id: string }
  | { name: 'compare'; playerId: string; strokeId?: string }
  | { name: 'trends'; playerId: string }
  | { name: 'rules' }
  | { name: 'strike' }
  | { name: 'drills'; topic?: string; stroke?: StrokeType; hand?: Handedness; back?: Route };

interface AppCtx {
  route: Route;
  go: (r: Route) => void;
  rules: Rule[];
  setRules: (r: Rule[]) => Promise<void>;
}

const VIEW_LABEL: Record<Route['name'], string> = {
  library: 'Library', import: 'Import', session: 'Session', compare: 'Compare', trends: 'Progress', rules: 'Coach', drills: 'Drills', strike: 'Strike lab',
};

const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const [rules, setRulesState] = useState<Rule[] | null>(null);

  const [cloud, setCloud] = useState<CloudStatus>(cloudStatus());

  useEffect(() => {
    store.rules().then(setRulesState);
    const off = onCloudStatus(setCloud);
    startCloud();
    const reloadRules = () => store.rules().then(setRulesState);
    window.addEventListener(CHANGED, reloadRules);
    return () => { off(); window.removeEventListener(CHANGED, reloadRules); };
  }, []);

  const setRules = useCallback(async (r: Rule[]) => {
    setRulesState(r);
    await store.saveRules(r);
  }, []);

  if (!rules) return <div className="loading">Loading…</div>;

  return (
    <Ctx.Provider value={{ route, go: setRoute, rules, setRules }}>
      <div className="app">
        <header className="topbar">
          <button className="brand" onClick={() => setRoute({ name: 'library' })}>
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /> VIDRIO <em>/ PADEL TELEMETRY</em>
          </button>
          <nav>
            <button className={route.name !== 'rules' && route.name !== 'drills' && route.name !== 'strike' ? 'active' : ''} onClick={() => setRoute({ name: 'library' })}>Players</button>
            <button className={route.name === 'drills' ? 'active' : ''} onClick={() => setRoute({ name: 'drills' })}>Drills</button>
            <button className={route.name === 'strike' ? 'active' : ''} onClick={() => setRoute({ name: 'strike' })}>Strike lab</button>
            <button className={route.name === 'rules' ? 'active' : ''} onClick={() => setRoute({ name: 'rules' })}>Coach settings</button>
          </nav>
          <div className="telemetry" aria-hidden="true">
            <span className="opt">Pose <b>33 pts</b></span>
            <span className="opt">Phases <b>6</b></span>
            <CloudBadge s={cloud} />
            <span>View <b>{VIEW_LABEL[route.name]}</b></span>
            <span className="live">Ready</span>
          </div>
        </header>
        <main>
          {route.name === 'library' && <Library initialPlayerId={route.playerId} />}
          {route.name === 'import' && <ImportView playerId={route.playerId} />}
          {route.name === 'session' && <SessionView id={route.id} />}
          {route.name === 'compare' && <CompareView playerId={route.playerId} strokeId={route.strokeId} />}
          {route.name === 'trends' && <TrendsView playerId={route.playerId} />}
          {route.name === 'rules' && <RulesView />}
          {route.name === 'strike' && <StrikeStudy />}
          {route.name === 'drills' && <DrillsView key={`${route.topic}/${route.stroke}`} topic={route.topic} stroke={route.stroke} hand={route.hand} back={route.back} />}
        </main>
      </div>
    </Ctx.Provider>
  );
}

const CLOUD_LABEL: Record<CloudStatus['state'], string> = {
  off: 'This device', connecting: 'Connecting', syncing: 'Syncing', synced: 'Saved', error: 'Not synced',
};
const CLOUD_HINT: Record<CloudStatus['state'], string> = {
  off: 'Saved on this device only. Open the app from its claude.ai link to save to the cloud.',
  connecting: 'Connecting to your cloud storage…',
  syncing: 'Saving to your cloud storage…',
  synced: 'Players and sessions are saved to your cloud and show on every device that opens this link.',
  error: 'Some changes have not reached the cloud yet.',
};

function CloudBadge({ s }: { s: CloudStatus }) {
  return (
    <span className={`cloud cloud-${s.state}`} title={s.note ?? CLOUD_HINT[s.state]}>
      Cloud <b>{CLOUD_LABEL[s.state]}</b>
    </span>
  );
}
