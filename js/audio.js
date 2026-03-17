const ctx = new AudioContext();
const base = window.location.hostname === "127.0.0.1" ? "../sfx/" : "/yetanothertftrolldownsim/sfx/";

export async function playSound(path) {
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  if (ctx.state !== 'running') return;

  const response = await fetch(`${base}/${path}`);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
}