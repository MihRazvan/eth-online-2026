import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Stencil } from "./Stencil";

const seenKey = "usufruct:intro-seen:v1";
const words = [
  "SEED",
  "WINDOW",
  "ESCROW",
  "CAPTURE",
  "PROOF",
  "REDEEM",
  "USDC",
  "SEPOLIA",
  "HOOKLESS",
  "SOLD ONCE",
  "NO ROLLOVER",
  "ONE WINDOW",
  "FIXED PERIOD",
];
function shouldIntroduce() {
  if (location.hash) return false;
  try {
    return sessionStorage.getItem(seenKey) !== "seen";
  } catch {
    return true;
  }
}

/** Brand introduction only. Its progress never represents data or transactions. */
export function IntroGate({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(shouldIntroduce);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const skip = useRef<HTMLButtonElement>(null);
  const art = useMemo(() => <Stencil seed="39216" fill={0.62} animate />, []);
  const dismiss = () => setVisible(false);
  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(seenKey, "seen");
    } catch {}
    const priorFocus = document.activeElement;
    skip.current?.focus({ preventScroll: true });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now(),
      duration = still ? 500 : 2100;
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setProgress(
        still ? 100 : Math.min(100, Math.floor((elapsed / duration) * 100)),
      );
      if (elapsed >= duration + (still ? 0 : 260)) setFading(true);
      if (elapsed >= duration + (still ? 0 : 710)) dismiss();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        skip.current?.focus();
        return;
      }
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        dismiss();
      }
    };
    addEventListener("keydown", escape);
    addEventListener("hashchange", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("keydown", escape);
      removeEventListener("hashchange", dismiss);
      if (
        priorFocus instanceof HTMLElement &&
        priorFocus.isConnected &&
        priorFocus !== document.body
      )
        priorFocus.focus({ preventScroll: true });
    };
  }, [visible]);
  return (
    <>
      <div inert={visible || undefined} aria-hidden={visible || undefined}>
        {children}
      </div>
      {visible && (
        <section
          className={`brand-intro${fading ? " off" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to usufruct"
        >
          <div className="intro-crop" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="intro-label tele">usufruct.exe</span>
          <button ref={skip} className="intro-skip" onClick={dismiss}>
            Skip intro
          </button>
          <div className="intro-stage" aria-hidden="true">
            <div className="intro-art">{art}</div>
            <div className="intro-word">
              {progress === 100
                ? "USUFRUCT"
                : words[
                    Math.floor((progress * 2100) / 100 / 135) % words.length
                  ]}
            </div>
          </div>
          <div className="intro-foot">
            <div className="intro-bar" aria-hidden="true">
              {Array.from({ length: 34 }, (_, index) => (
                <i
                  key={index}
                  className={index / 34 < progress / 100 ? "on" : ""}
                />
              ))}
            </div>
            <div className="intro-meta">
              <span className="tele">Opening usufruct</span>
              <span className="tele" aria-hidden="true">
                {progress}%
              </span>
            </div>
            <span className="sr-only">
              A short brand introduction. Press Escape or Enter to skip. This
              animation does not indicate network or transaction progress.
            </span>
          </div>
        </section>
      )}
    </>
  );
}
