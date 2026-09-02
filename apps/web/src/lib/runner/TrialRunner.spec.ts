import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialRunner } from './TrialRunner.svelte';
import type { Phase } from './types';

/**
 * Deterministischer rAF-Ersatz: die Tests treiben die Uhr selbst voran, damit
 * Phasenwechsel und Abbruchbedingungen exakt prüfbar sind.
 */
class FakeClock {
  now = 0;
  private callbacks: ((ts: number) => void)[] = [];

  install() {
    vi.stubGlobal('performance', { now: () => this.now });
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      this.callbacks.push(cb);
      return this.callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  }

  /** Einen Frame um `deltaMs` weiterschalten. */
  frame(deltaMs = 16) {
    this.now += deltaMs;
    const due = this.callbacks;
    this.callbacks = [];
    for (const cb of due) cb(this.now);
  }

  frames(count: number, deltaMs = 16) {
    for (let i = 0; i < count; i++) this.frame(deltaMs);
  }
}

const clock = new FakeClock();

beforeEach(() => {
  clock.now = 0;
  clock.install();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});

function makeRunner(overrides: Partial<Parameters<typeof buildOptions>[0]> = {}) {
  return new TrialRunner<{ choice: number }>(buildOptions(overrides));
}

function buildOptions(o: {
  trialCount?: number;
  phases?: (index: number) => Phase[];
  timingSensitive?: boolean;
  onFinish?: (records: unknown[], durationMs: number) => void;
  correct?: boolean;
  shouldStopEarly?: (index: number) => boolean;
}) {
  return {
    trialCount: o.trialCount ?? 2,
    phases:
      o.phases ??
      (() => [
        { name: 'fixation', durationMs: 100, acceptsInput: false },
        { name: 'stimulus', durationMs: 500, acceptsInput: true },
      ]),
    timingSensitive: o.timingSensitive ?? true,
    onTrialEnd: () => o.correct ?? true,
    onFinish: o.onFinish ?? (() => {}),
    shouldStopEarly: o.shouldStopEarly,
  };
}

describe('TrialRunner – Phasensteuerung (§6)', () => {
  it('durchläuft die Phasen in Reihenfolge und respektiert die Soll-Dauern', () => {
    const runner = makeRunner();
    runner.start();
    clock.frame(16);
    expect(runner.phaseName).toBe('fixation');
    expect(runner.acceptsInput).toBe(false);

    // Die Fixation endet im ersten Frame ab 100 ms nach ihrem Onset.
    clock.frames(6, 16);
    expect(runner.phaseName).toBe('fixation');
    clock.frame(16);
    expect(runner.phaseName).toBe('stimulus');
    expect(runner.acceptsInput).toBe(true);
  });

  it('zeichnet die tatsächliche Präsentationsdauer auf, nicht die gewünschte', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frame(16);
    clock.frames(8, 16); // deutlich über 100 ms
    clock.frames(40, 16);
    const record = runner.records[0];
    expect(record).toBeDefined();
    const fixation = record.phases.find((p) => p.name === 'fixation');
    expect(fixation).toBeDefined();
    // tatsächlich präsentiert ist mindestens die Soll-Dauer, aber gerastert
    expect(fixation!.presentedMs).toBeGreaterThanOrEqual(100);
    expect(fixation!.presentedMs).toBeLessThan(100 + 32);
  });

  it('misst die Reaktionszeit ab dem Onset der ersten Input-Phase', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(8, 16); // bis in die Stimulus-Phase
    expect(runner.phaseName).toBe('stimulus');
    clock.frame(50);
    const at = clock.now;
    runner.submitResponse({ choice: 1 }, at);
    clock.frames(40, 16);

    const record = runner.records[0];
    const stimulus = record.phases.find((p) => p.name === 'stimulus');
    expect(stimulus).toBeDefined();
    // Reaktionszeit = Handler-Zeitstempel minus Onset der Input-Phase (§6.1 Regel 5).
    expect(record.rtMs).toBe(at - stimulus!.onsetMs);
    expect(record.response).toEqual({ choice: 1 });
  });

  it('nimmt nur eine abschließende Antwort pro Trial an', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(8, 16);
    runner.submitResponse({ choice: 1 });
    runner.submitResponse({ choice: 2 });
    clock.frames(40, 16);
    expect(runner.records[0].response).toEqual({ choice: 1 });
  });

  it('lässt eine laufende Zwischenantwort die Endantwort nicht blockieren', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(8, 16);
    runner.updateResponse({ choice: 9 });
    runner.submitResponse({ choice: 3 });
    clock.frames(40, 16);
    expect(runner.records[0].response).toEqual({ choice: 3 });
  });

  it('beendet eine wartende Phase (durationMs null) mit der Antwort', () => {
    const runner = makeRunner({
      trialCount: 1,
      phases: () => [{ name: 'answer', durationMs: null, acceptsInput: true }],
    });
    let finished = false;
    const runner2 = new TrialRunner<{ choice: number }>(
      buildOptions({
        trialCount: 1,
        phases: () => [{ name: 'answer', durationMs: null, acceptsInput: true }],
        onFinish: () => (finished = true),
      }),
    );
    runner.destroy();
    runner2.start();
    clock.frames(3, 16);
    expect(finished).toBe(false);
    runner2.submitResponse({ choice: 1 });
    clock.frame(16);
    expect(finished).toBe(true);
  });

  it('ruft onFinish nach dem letzten Trial mit der Gesamtdauer auf', () => {
    let records: unknown[] = [];
    let duration = 0;
    const runner = new TrialRunner<{ choice: number }>(
      buildOptions({
        trialCount: 3,
        onFinish: (r, d) => {
          records = r;
          duration = d;
        },
      }),
    );
    runner.start();
    clock.frames(150, 16);
    expect(records).toHaveLength(3);
    expect(duration).toBeGreaterThan(0);
    expect(runner.status).toBe('finished');
  });
});

describe('TrialRunner – Abbruchbedingungen (§6.2)', () => {
  it('markiert den Run bei einem Frame-Abstand über 250 ms als ungültig', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frame(16);
    expect(runner.abortReason).toBeNull();
    clock.frame(300);
    expect(runner.abortReason).toBe('frameGap');
  });

  it('lässt Frame-Abstände unter der Schwelle unangetastet', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(10, 240);
    // 240 ms liegen unter der 250-ms-Grenze; die grobe Rasterung schlägt
    // stattdessen als Dauer-Abweichung zu Buche – das ist die andere Regel.
    expect(runner.abortReason).not.toBe('frameGap');
  });

  it('markiert eine zu große Abweichung der Präsentationsdauern', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(10, 240);
    expect(runner.abortReason).toBe('durationDrift');
  });

  it('lässt saubere Frames ohne Beanstandung durchlaufen', () => {
    const runner = makeRunner({ trialCount: 1 });
    runner.start();
    clock.frames(200, 4);
    expect(runner.status).toBe('finished');
    expect(runner.abortReason).toBeNull();
  });

  it('bricht auf Wunsch ab und beendet den Run', () => {
    let finished = false;
    const runner = new TrialRunner<{ choice: number }>(
      buildOptions({ trialCount: 5, onFinish: () => (finished = true) }),
    );
    runner.start();
    clock.frames(5, 16);
    runner.abort();
    expect(runner.abortReason).toBe('aborted');
    expect(runner.status).toBe('finished');
    expect(finished).toBe(true);
  });

  it('prüft die Frame-Gap-Regel bei timingSensitive: false nicht auf Sichtbarkeit', () => {
    // Spiele ohne Zeitdruck registrieren keine visibility/blur-Wächter (§6.2).
    const addEventListener = vi.fn();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener,
      removeEventListener: () => {},
    });
    vi.stubGlobal('window', { addEventListener, removeEventListener: () => {} });
    const runner = makeRunner({ trialCount: 1, timingSensitive: false });
    runner.start();
    clock.frames(3, 16);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('beendet den Run vorzeitig, wenn shouldStopEarly greift', () => {
    let records: unknown[] = [];
    const runner = new TrialRunner<{ choice: number }>(
      buildOptions({
        trialCount: 5,
        shouldStopEarly: (index) => index === 1,
        onFinish: (r) => (records = r),
      }),
    );
    runner.start();
    clock.frames(200, 16);
    // Alle fünf Trials sind aufgezeichnet; die letzten drei als nicht bearbeitet.
    expect(records).toHaveLength(5);
    expect(runner.records[4].response).toBeNull();
    expect(runner.records[4].correct).toBe(false);
  });
});
