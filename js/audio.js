const ctx = new AudioContext();
const base = window.location.hostname === "127.0.0.1:5500" ? "." : "/yetanothertftrolldownsim";

export async function playSound(path) {
  const response = await fetch(`${base}/${path}`);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
}