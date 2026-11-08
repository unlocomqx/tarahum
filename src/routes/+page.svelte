<script lang="ts">
  import { onMount } from "svelte";
  import { createActor } from "xstate";
  import { loadFileset, openCamera, runLoop, type Detector, type Fileset } from "#lib/camera.ts";
  import { DEFAULT_THRESHOLDS } from "#lib/middle.ts";
  import { createMiddleDetector } from "#lib/middleDetector.ts";
  import { createSideDetector } from "#lib/sideDetector.ts";
  import { rakaatMachine } from "#lib/rakaatMachine.ts";

  type Mode = "middle" | "side";

  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let status = $state("Loading…");
  let readout = $state("");
  let mode = $state<Mode>("middle");
  let thresholds = $state({ ...DEFAULT_THRESHOLDS });

  const actor = createActor(rakaatMachine, { input: { minHoldMs: 400 } });
  let snapshot = $state(actor.getSnapshot());
  actor.subscribe((s) => (snapshot = s));

  let fileset: Fileset | null = null;
  let detector: Detector | null = null;

  async function useMode(next: Mode) {
    if (!fileset) return;
    detector?.close();
    detector = null;
    status = "Loading model…";
    const d =
      next === "middle"
        ? await createMiddleDetector(fileset, () => ({ stable: snapshot.context.stable, thresholds }))
        : await createSideDetector(fileset);
    if (next !== mode) return d.close();
    detector = d;
    actor.send({ type: "RESET" });
    status = "";
  }

  function setMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    useMode(next);
  }

  function reset() {
    actor.send({ type: "RESET" });
    detector?.recalibrate?.();
  }

  onMount(() => {
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    (async () => {
      if (new URLSearchParams(location.search).has("inspect")) {
        const { createBrowserInspector } = await import("@statelyai/inspect");
        actor.system.inspect(createBrowserInspector().inspect);
      }
      actor.start();
      try {
        const [stop, fs] = await Promise.all([openCamera(video), loadFileset()]);
        cleanups.push(stop);
        if (cancelled) return stop();
        fileset = fs;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        await useMode(mode);
        cleanups.push(
          runLoop(video, (ts) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!detector) return;
            const f = detector.process(video, ts, ctx);
            readout = f.readout;
            actor.send({ type: "POSTURE", posture: f.posture });
          }),
        );
      } catch (err) {
        status = `Error: ${err instanceof Error ? err.message : err}`;
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
      detector?.close();
      actor.stop();
    };
  });
</script>

<main>
  <section class="stage">
    <video bind:this={video} playsinline muted></video>
    <canvas bind:this={canvas}></canvas>
    {#if readout}<div class="badge readout">{readout}</div>{/if}
    {#if status}<div class="badge status">{status}</div>{/if}
  </section>
  <section class="panel">
    <div class="count">{snapshot.context.rakaat}</div>
    <div class="segmented" role="radiogroup" aria-label="Phone placement">
      {#each ["middle", "side"] as const as m}
        <button role="radio" aria-checked={mode === m} class:active={mode === m} onclick={() => setMode(m)}>
          {m === "middle" ? "Middle" : "Side"}
        </button>
      {/each}
    </div>
    <div class="row"><span>Posture</span><strong>{snapshot.context.stable ?? "—"}</strong></div>
    <div class="row"><span>Phase</span><strong>{(snapshot.value as { rakah: string }).rakah}</strong></div>
    <label class="row">
      <span>Hold {snapshot.context.minHoldMs} ms</span>
      <input
        type="range"
        min="100"
        max="1500"
        step="50"
        value={snapshot.context.minHoldMs}
        oninput={(e) => actor.send({ type: "SET_HOLD", ms: Number(e.currentTarget.value) })}
      />
    </label>
    {#if mode === "middle"}
      <label class="row">
        <span>Lowered at face ×{thresholds.lowered.toFixed(2)}</span>
        <input type="range" min="1.05" max="2.5" step="0.05" bind:value={thresholds.lowered} />
      </label>
      <label class="row">
        <span>Covered below {Math.round(thresholds.cover * 100)}% light</span>
        <input type="range" min="0.1" max="0.8" step="0.05" bind:value={thresholds.cover} />
      </label>
    {/if}
    <button onclick={reset}>{mode === "middle" ? "Reset & recalibrate" : "Reset"}</button>
  </section>
</main>

<style>
  :global(:root) {
    color-scheme: light dark;
    font-family: system-ui, sans-serif;
  }
  :global(body) { margin: 0; background: Canvas; color: CanvasText; }
  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 16px;
    padding: 16px;
    min-height: 100dvh;
    box-sizing: border-box;
  }
  @media (max-width: 720px) {
    main { grid-template-columns: 1fr; }
  }
  .stage { position: relative; align-self: start; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; background: #000; }
  video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; transform: scaleX(-1); }
  .badge {
    position: absolute;
    left: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font: 13px/1.4 ui-monospace, monospace;
    white-space: pre;
  }
  .readout { top: 8px; }
  .status { bottom: 8px; }
  .panel { display: flex; flex-direction: column; gap: 12px; }
  .count { font-size: 120px; font-weight: 700; line-height: 1; text-align: center; font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-direction: column; gap: 4px; }
  .row span { opacity: 0.7; font-size: 14px; }
  .row strong { font-size: 20px; }
  .segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 2px; gap: 2px; border-radius: 8px; background: color-mix(in srgb, CanvasText 8%, transparent); }
  .segmented button { border: none; padding: 6px; font-size: 14px; }
  .segmented button.active { background: Canvas; box-shadow: 0 1px 2px rgb(0 0 0 / 0.15); }
  button { padding: 10px; font-size: 16px; border-radius: 8px; border: 1px solid currentColor; background: none; color: inherit; cursor: pointer; }
</style>
