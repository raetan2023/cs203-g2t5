import { useEffect, useRef, useState, type RefObject } from 'react';
import { DECK_LIGHT_COUNT, type LightLevel } from './ReactiveShip';

// Clerk renders ordinary DOM, so its fields are found by their stable names; the mock form uses email/password.
const EMAIL = 'input[type="email"], input[name="identifier"], input[name="emailAddress"], input[name="email"]';
const PASSWORD = 'input[name="password"], input[type="password"]';
// Clerk field errors and alerts, and the mock form's alerts.
const ERROR = '.cl-formFieldErrorText, .cl-alert, [role="alert"]';

type Phase = 'idle' | 'sending' | 'error';

/** A reachable password field that holds a value: the submit is really sending a password. */
const visiblePassword = (form: HTMLFormElement) => [...form.querySelectorAll<HTMLInputElement>(PASSWORD)]
  .some(input => input.value !== '' && input.tabIndex !== -1 && !input.closest('[aria-hidden="true"]'));

/**
 * Reads the sign-in or sign-up form inside `container` without touching it: focus, how much of the email is typed,
 * whether the password is hidden, a submit, and a returned error. Presentation only; authentication is unchanged.
 */
export function useAuthFormSignals(container: RefObject<HTMLElement | null>) {
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [emailLength, setEmailLength] = useState(0);
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [shake, setShake] = useState(0);
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let settle: number | undefined;
    const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };
    const kind = (target: EventTarget | null) => target instanceof HTMLInputElement
      ? target.matches(EMAIL) ? 'email' : target.matches(PASSWORD) ? 'password' : null : null;
    const read = (target: EventTarget | null) => {
      if (!(target instanceof HTMLInputElement)) return;
      const k = kind(target);
      if (k === 'email') setEmailLength(target.value.length);
      if (k === 'password') setPasswordHidden(target.type === 'password');
    };
    const onFocusIn = (event: FocusEvent) => { setFocus(kind(event.target)); read(event.target); };
    const onFocusOut = (event: FocusEvent) => { if (!root.contains(event.relatedTarget as Node | null)) setFocus(null); };
    const onInput = (event: Event) => { read(event.target); if (phaseRef.current === 'error') setPhase('idle'); };
    // The password toggle flips the input type without an input event.
    const onClick = () => window.setTimeout(() => {
      const password = root.querySelector<HTMLInputElement>(PASSWORD);
      if (password) setPasswordHidden(password.type === 'password');
    });
    const onSubmit = (event: Event) => {
      // Only a submit that sends a password sets off; an email-only Continue (empty or hidden password) does not.
      if (!(event.target instanceof HTMLFormElement) || !visiblePassword(event.target)) return;
      setPhase('sending');
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { if (phaseRef.current === 'sending') setPhase('idle'); }, 8000);
    };
    // An error rendered after a submit turns the attempt back (and shakes the card once).
    const errors = new MutationObserver(() => {
      if (phaseRef.current !== 'sending' || !root.querySelector(ERROR)) return;
      setPhase('error');
      setShake(value => value + 1);
    });
    errors.observe(root, { childList: true, subtree: true });
    const onVisibility = () => setPaused(document.hidden);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(settle);
      errors.disconnect();
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onClick);
      root.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [container]);

  const busy = phase === 'sending';
  const hiding = !busy && focus === 'password' && passwordHidden;
  // Typing the email lights the deck one light per character, stern to bow.
  const level = (index: number): LightLevel => busy ? 'hot' : hiding ? 'off'
    : focus === 'email' ? index < emailLength ? 'hot' : 'off' : 'on';
  return {
    levels: Array.from({ length: DECK_LIGHT_COUNT }, (_, index) => level(index)),
    bridge: (busy || focus === 'email' ? 'hot' : hiding ? 'off' : 'on') as LightLevel,
    dim: hiding,
    sail: busy,
    shake,
    paused,
  };
}
