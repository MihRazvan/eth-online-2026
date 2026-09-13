/** Reload is always explicit and never clears transaction/signature journals. */
export function AppUpdateNotice({ pending = false }: { pending?: boolean }) {
  return (
    <section className="alert error" role="alert" aria-label="App update available">
      <div>
        <p>A new app version is available. Reload this page, then review again. Confirmed transactions remain onchain.</p>
        {pending && <p className="fine">Wait for the current wallet request or transaction to finish before reloading.</p>}
        <button className="button" disabled={pending} onClick={() => location.reload()}>Reload app</button>
      </div>
    </section>
  );
}
