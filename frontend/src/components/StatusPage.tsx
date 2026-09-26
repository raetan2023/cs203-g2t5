import { Brand } from './Brand';

export function StatusPage({ message, error, retry }: { message: string; error?: string; retry?: () => void }) {
  return <div className="bb-app"><header className="bb-header"><Brand /></header><main className="bb-status">
    {error ? <><h1>Unable to load your session</h1><p role="alert">{error}</p><button className="bb-button" onClick={retry}>Retry</button></> : <div role="status"><span className="bb-spinner" aria-hidden="true" /><p>{message}</p></div>}
  </main></div>;
}
