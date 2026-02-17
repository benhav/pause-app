// app/lib/softBreath.ts
export class SoftBreath {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  async init() {
    if (this.ctx) return;
    // @ts-ignore
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setVolume(v: number) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  private noiseBuffer(seconds = 1) {
    if (!this.ctx) return null;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // litt “pink-ish” ved enkel smoothing
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }
    return buf;
  }

  // En veldig myk “pust inn/ut” ved å forme noise med filter+envelope
  breath(when: number, duration: number, direction: "in" | "out") {
    if (!this.ctx || !this.master) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.max(1, duration))!;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = direction === "in" ? 900 : 650;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);

    // Envelope (myk)
    const attack = Math.min(0.25, duration * 0.25);
    const release = Math.min(0.35, duration * 0.35);
    const sustainT = Math.max(0, duration - attack - release);

    g.gain.exponentialRampToValueAtTime(0.35, when + attack);
    g.gain.setValueAtTime(0.35, when + attack + sustainT);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);

    src.start(when);
    src.stop(when + duration);
  }

  // Liten “chime” for markering
  chime(when: number, freq = 528, len = 0.12) {
    if (!this.ctx || !this.master) return;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, when);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.12, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);

    osc.connect(g);
    g.connect(this.master);

    osc.start(when);
    osc.stop(when + len);
  }

  now() {
    return this.ctx?.currentTime ?? 0;
  }
}
