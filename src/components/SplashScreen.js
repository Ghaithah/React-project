import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import './SplashScreen.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Full-screen brand intro shown every time the app loads, in the spirit of
 * Netflix's "ta-dum" launch animation: the mark pops in with a quick flash,
 * the wordmark settles underneath, then the whole thing fades away to
 * reveal the app (which lands on /login automatically if no one's signed
 * in, via ProtectedRoute).
 */
function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState('enter'); // 'enter' -> 'hold' -> 'exit'
  const timers = useRef([]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(REDUCED_MOTION_QUERY).matches
        : false;

    if (prefersReducedMotion) {
      // Skip the animated sequence; show the mark briefly then continue.
      timers.current.push(setTimeout(onFinish, 500));
      return () => timers.current.forEach(clearTimeout);
    }

    timers.current.push(setTimeout(() => setPhase('hold'), 700));
    timers.current.push(setTimeout(() => setPhase('exit'), 1900));
    timers.current.push(setTimeout(onFinish, 2500));

    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`splash splash--${phase}`} role="presentation" aria-hidden="true">
      <div className="splash-flash" />
      <div className="splash-mark">
        <Logo height={120} showWordmark={false} color="#e8b04b" outlineColor="#0d0f14" />
      </div>
      <div className="splash-wordmark">
        <span>WATCH</span>
        <span className="splash-amp">&amp;</span>
        <span>WONDER</span>
      </div>
    </div>
  );
}

export default SplashScreen;