import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useT } from '@/features/i18n';
import { BUILD_INFO, RELEASE } from '@/lib/buildInfo';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from '../shell/Icons';

export interface AboutDialogProps {
  readonly onClose: () => void;
}

const SECTIONS = [
  ['aboutWhatH', 'aboutWhat'],
  ['aboutDataH', 'aboutData'],
  ['aboutRiskH', 'aboutRisk'],
  ['aboutNoH', 'aboutNo'],
  ['aboutStateH', 'aboutState'],
  ['aboutLicH', 'aboutLic'],
] as const;

const build = [RELEASE, BUILD_INFO.sha, BUILD_INFO.date].filter(Boolean).join(' · ');

/** What the app is, where the data lives, and what it cannot do (D-051). Read-only. */
export function AboutDialog({ onClose }: AboutDialogProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (ref.current) trapTab(ref.current, event.nativeEvent);
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal about"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="ed-head">
          <h2 id={titleId}>{t('aboutTitle')}</h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="ed-body">
          {SECTIONS.map(([head, body]) => (
            <section key={head}>
              <h3 className="about-head">{t(head)}</h3>
              <p className="about-text">{t(body)}</p>
            </section>
          ))}
          <p className="muted about-build">
            {t('aboutBuild')}: <bdi dir="ltr">{build}</bdi>
          </p>
        </div>
      </div>
    </div>
  );
}
