<script lang="ts">
  import { onMount } from "svelte";
  import { createActor } from "xstate";
  import { startCamera, type Frame } from "#lib/camera.ts";
  import { rakaatMachine } from "#lib/rakaatMachine.ts";

  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let status = $state("Loading model…");
  let frame = $state<Frame | null>(null);

  const actor = createActor(rakaatMachine, { input: { minHoldMs: 400 } });
  let snapshot = $state(actor.getSnapshot());
  actor.subscribe((s) => (snapshot = s));

  const angles = $derived.by(() => {
    if (!frame) return "";
    const m = frame.measurement;
    if (!m) return `raw   ${frame.posture}`;
    return `side  ${m.side}\ntorso ${m.torso.toFixed(0)}°\nknee  ${m.knee.toFixed(0)}°\nhead<hip ${m.headBelowHip}\nraw   ${frame.posture}`;
  });

  onMount(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (new URLSearchParams(location.search).has("inspect")) {
        const { createBrowserInspector } = await import("@statelyai/inspect");
        actor.system.inspect(createBrowserInspector().inspect);
      }
      actor.start();
      try {
        const s = await startCamera(video, canvas, (f) => {
          frame = f;
          actor.send({ type: "POSTURE", posture: f.posture });
        });
        if (cancelled) s();
        else stop = s;
        status = "";
      } catch (err) {
        status = `Error: ${err instanceof Error ? err.message : err}`;
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      actor.stop();
    };
  });
</script>

<main>
  <section class="stage">
    <video bind:this={video} playsinline muted></video>
    <canvas bind:this={canvas}></canvas>
    {#if angles}<div class="badge angles">{angles}</div>{/if}
    {#if status}<div class="badge status">{status}</div>{/if}
  </section>
  <section class="panel">
    <div class="count">{snapshot.context.rakaat}</div>
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
    <button onclick={() => actor.send({ type: "RESET" })}>Reset</button>
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
  .angles { top: 8px; }
  .status { bottom: 8px; }
  .panel { display: flex; flex-direction: column; gap: 12px; }
  .count { font-size: 120px; font-weight: 700; line-height: 1; text-align: center; font-variant-numeric: tabular-nums; }
  .row { display: flex; flex-direction: column; gap: 4px; }
  .row span { opacity: 0.7; font-size: 14px; }
  .row strong { font-size: 20px; }
  button { padding: 10px; font-size: 16px; border-radius: 8px; border: 1px solid currentColor; background: none; color: inherit; cursor: pointer; }
</style>
