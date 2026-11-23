/* 《合成大奶蛙》 2D 物理合成引擎 v2.3（多步约束求解 + 强力多段摇一摇解卡物理 + 11位奶家人专属原声音效引擎） */
(function () {
  "use strict";

  const W = 420;
  const H = 620;
  const WALL = 8;
  const FLOOR = 8;
  const SPAWN_Y = 46;
  const DANGER_Y = 102;
  const GRAVITY = 1480;
  const RESTITUTION = 0.2;
  const SUB_STEPS = 8;
  const POS_ITERS = 4;
  const MAX_SPEED = 920;
  const DROP_COOLDOWN_MS = 300;
  const DROP_BUFFER_WINDOW_MS = 180;
  const DANGER_LIMIT_SEC = 3.0;
  const SHAKE_DURATION = 0.95;
  const SHAKE_GRACE_SEC = 2.8;

  const LS_BEST = "naiwa_merge_best_v1";
  const LS_UNLOCKED = "naiwa_merge_unlocked_v1";
  const LS_MUTE = "naiwa_sound_mute_v1";
  const LS_SFX_VOL = "naiwa_sfx_vol_v1";
  const LS_BGM_TRACK = "naiwa_bgm_track_v1";
  const LS_BGM_VOL = "naiwa_bgm_vol_v1";
  const LS_BGM_MUTE = "naiwa_bgm_mute_v1";

  // --- 奶家人真实原声音效引擎（Web Audio API 预加载零延迟解码 + MasterGain 实时音量 + HTMLAudio 兜底）---
  const SoundFX = {
    ctx: null,
    masterGain: null,
    muted: false,
    volume: 0.85,
    prevVolume: 0.85,
    listeners: new Set(),
    rawMap: new Map(),
    rawPromises: new Map(),
    bufMap: new Map(),
    decodingMap: new Map(),
    activeVoice: null,
    activeHtmlAudio: null,
    activeHtmlMeta: null,
    playToken: 0,
    lastMouseDropAt: -9999,
    preloaded: false,

    init() {
      try {
        this.muted = localStorage.getItem(LS_MUTE) === "1";
        const savedVol = parseFloat(localStorage.getItem(LS_SFX_VOL));
        if (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) {
          this.volume = savedVol;
          if (savedVol > 0.02) this.prevVolume = savedVol;
          if (savedVol <= 0.001) this.muted = true;
        }
      } catch (e) {}
      this.preloadAll();
    },

    onChange(fn) {
      if (typeof fn === "function") this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    emitChange() {
      this.listeners.forEach((fn) => {
        try {
          fn(this);
        } catch (e) {}
      });
    },

    getEffectiveGain() {
      if (this.muted || this.volume <= 0.001) return 0;
      return Math.max(0, Math.min(1, this.volume));
    },

    applyVolumeNow() {
      const g = this.getEffectiveGain();
      if (this.masterGain && this.ctx) {
        try {
          const now = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setTargetAtTime(g, now, 0.015);
        } catch (e) {
          this.masterGain.gain.value = g;
        }
      }
      if (this.activeHtmlAudio) {
        const baseVol = (this.activeHtmlMeta && typeof this.activeHtmlMeta.baseVolume === "number")
          ? this.activeHtmlMeta.baseVolume
          : 0.94;
        this.activeHtmlAudio.volume = Math.max(0, Math.min(1, baseVol * g));
      }
    },

    setVolume(val) {
      const v = Math.max(0, Math.min(1, Number(val)));
      if (!isFinite(v)) return;
      this.volume = v;
      if (v > 0.01) {
        this.prevVolume = v;
        this.muted = false;
      } else {
        this.muted = true;
        this.playToken += 1;
        this.stopVoice();
      }
      this.applyVolumeNow();
      try {
        localStorage.setItem(LS_SFX_VOL, v.toFixed(3));
        localStorage.setItem(LS_MUTE, this.muted ? "1" : "0");
      } catch (e) {}
      this.emitChange();
    },

    getTierAudioUrl(tierIndex) {
      const tiers = window.NAIWA_DATA && window.NAIWA_DATA.FAMILY_TIERS;
      if (!tiers || tierIndex < 0 || tierIndex >= tiers.length) return null;
      return tiers[tierIndex].audio || null;
    },

    preloadAll() {
      if (this.preloaded) return;
      const tiers = window.NAIWA_DATA && window.NAIWA_DATA.FAMILY_TIERS;
      if (!tiers) return;
      this.preloaded = true;
      tiers.forEach((t, idx) => {
        if (t && t.audio) this.fetchRaw(idx, t.audio);
      });
    },

    fetchRaw(tierIndex, url) {
      if (this.rawMap.has(tierIndex)) return Promise.resolve(this.rawMap.get(tierIndex));
      if (this.rawPromises.has(tierIndex)) return this.rawPromises.get(tierIndex);
      const p = fetch(url, { credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((ab) => {
          this.rawMap.set(tierIndex, ab);
          if (this.ctx) this.decodeTier(tierIndex);
          return ab;
        })
        .catch(() => {
          this.rawPromises.delete(tierIndex);
          return null;
        });
      this.rawPromises.set(tierIndex, p);
      return p;
    },

    decodeTier(tierIndex) {
      if (this.bufMap.has(tierIndex)) return Promise.resolve(this.bufMap.get(tierIndex));
      if (this.decodingMap.has(tierIndex)) return this.decodingMap.get(tierIndex);
      const ctx = this.ctx;
      const url = this.getTierAudioUrl(tierIndex);
      if (!ctx || !url) return Promise.resolve(null);

      const p = this.fetchRaw(tierIndex, url)
        .then((ab) => {
          if (!ab || !this.ctx) return null;
          return this.ctx.decodeAudioData(ab.slice(0));
        })
        .then((decoded) => {
          if (decoded) this.bufMap.set(tierIndex, decoded);
          return decoded;
        })
        .catch(() => null)
        .finally(() => {
          this.decodingMap.delete(tierIndex);
        });
      this.decodingMap.set(tierIndex, p);
      return p;
    },

    ensureCtx() {
      if (this.muted || this.volume <= 0.001) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = this.getEffectiveGain();
          this.masterGain.connect(this.ctx.destination);
        }
      }
      if (this.ctx && !this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.getEffectiveGain();
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      this.preloadAll();
      if (this.ctx) {
        this.rawMap.forEach((_, idx) => {
          if (!this.bufMap.has(idx) && !this.decodingMap.has(idx)) {
            this.decodeTier(idx);
          }
        });
      }
      return this.ctx;
    },

    getOutNode(ctx) {
      return this.masterGain || (ctx && ctx.destination) || null;
    },

    stopVoice() {
      if (this.activeVoice) {
        const { src, gain, ctx } = this.activeVoice;
        this.activeVoice = null;
        try {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
          src.stop(now + 0.038);
        } catch (e) {
          try {
            src.stop();
          } catch (_) {}
        }
      }
      if (this.activeHtmlAudio) {
        try {
          this.activeHtmlAudio.pause();
          this.activeHtmlAudio.currentTime = 0;
        } catch (e) {}
        this.activeHtmlAudio = null;
        this.activeHtmlMeta = null;
      }
    },

    warmUp(tierIndex) {
      if (this.muted) return;
      const ctx = this.ensureCtx();
      if (ctx && typeof tierIndex === "number" && !this.bufMap.has(tierIndex)) {
        this.decodeTier(tierIndex);
      }
    },

    setMuted(val) {
      this.muted = !!val;
      if (this.muted) {
        this.playToken += 1;
        this.stopVoice();
      } else if (this.volume <= 0.01) {
        this.volume = this.prevVolume > 0.02 ? this.prevVolume : 0.85;
      }
      this.applyVolumeNow();
      try {
        localStorage.setItem(LS_MUTE, this.muted ? "1" : "0");
        localStorage.setItem(LS_SFX_VOL, this.volume.toFixed(3));
      } catch (e) {}
      this.emitChange();
    },

    playHtmlFallback(url, tierIndex, volume, token, callbacks) {
      const eff = this.getEffectiveGain();
      if (eff <= 0 || token !== this.playToken) return false;
      try {
        this.stopVoice();
        const el = new Audio(url);
        el.volume = Math.max(0, Math.min(1, volume * eff));
        const nowMs = performance.now();
        this.activeHtmlAudio = el;
        const htmlMeta = {
          tier: tierIndex,
          baseVolume: volume,
          startedAtMs: nowMs,
          endAtMs: nowMs + 3450,
          onEnded: callbacks && typeof callbacks.onEnded === "function" ? callbacks.onEnded : null
        };
        this.activeHtmlMeta = htmlMeta;
        el.addEventListener("loadedmetadata", () => {
          if (this.activeHtmlAudio === el && isFinite(el.duration) && el.duration > 0) {
            const durMs = Math.round(el.duration * 1000);
            htmlMeta.endAtMs = htmlMeta.startedAtMs + durMs;
            if (callbacks && typeof callbacks.onStarted === "function") callbacks.onStarted(durMs);
          }
        });
        el.addEventListener("ended", () => {
          if (this.activeHtmlAudio === el) {
            this.activeHtmlAudio = null;
            this.activeHtmlMeta = null;
          }
          if (typeof htmlMeta.onEnded === "function") htmlMeta.onEnded();
        });
        const pr = el.play();
        if (callbacks && typeof callbacks.onStarted === "function") callbacks.onStarted(3450);
        if (pr && pr.catch) {
          pr.catch(() => {
            if (this.activeHtmlAudio === el) {
              this.activeHtmlAudio = null;
              this.activeHtmlMeta = null;
            }
          });
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    playDecodedBuffer(ctx, buf, tierIndex, volume, token, callbacks) {
      if (this.muted || this.volume <= 0.001 || token !== this.playToken || !buf || !ctx) return false;
      const startNow = () => {
        if (this.muted || this.volume <= 0.001 || token !== this.playToken || !buf || !ctx) return false;
        try {
          this.stopVoice();
          const src = ctx.createBufferSource();
          const gain = ctx.createGain();
          src.buffer = buf;
          const now = ctx.currentTime;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(volume, now + 0.012);
          src.connect(gain);
          gain.connect(this.getOutNode(ctx));
          const nowMs = performance.now();
          const durMs = Math.round(buf.duration * 1000);
          const voiceRec = {
            src,
            gain,
            ctx,
            tier: tierIndex,
            startedAtMs: nowMs,
            endAtMs: nowMs + durMs,
            onEnded: callbacks && typeof callbacks.onEnded === "function" ? callbacks.onEnded : null
          };
          this.activeVoice = voiceRec;
          src.onended = () => {
            if (this.activeVoice === voiceRec) this.activeVoice = null;
            if (typeof voiceRec.onEnded === "function") voiceRec.onEnded();
          };
          src.start(now);
          if (callbacks && typeof callbacks.onStarted === "function") callbacks.onStarted(durMs);
          return true;
        } catch (e) {
          return false;
        }
      };

      if (ctx.state === "suspended") {
        ctx.resume()
          .then(() => {
            if (!startNow() && callbacks && typeof callbacks.fallbackHtml === "function") {
              callbacks.fallbackHtml();
            }
          })
          .catch(() => {
            if (callbacks && typeof callbacks.fallbackHtml === "function") callbacks.fallbackHtml();
          });
        return true;
      }
      return startNow();
    },

    playTierVoice(tierIndex, opts) {
      if (this.muted) return false;
      const options = opts || {};
      const force = !!options.force;
      const volume = typeof options.volume === "number" ? options.volume : 0.92;
      const url = this.getTierAudioUrl(tierIndex);
      if (!url) {
        if (typeof options.fallbackFn === "function") options.fallbackFn();
        return false;
      }

      const nowMs = performance.now();
      if (!force && this.activeVoice && nowMs < this.activeVoice.endAtMs) {
        const protectMs = this.activeVoice.tier >= 9 ? 2200 : 1150;
        if (this.activeVoice.tier > tierIndex && nowMs - this.activeVoice.startedAtMs < protectMs) {
          return false;
        }
      }

      const token = ++this.playToken;
      const callbacks = {
        onStarted: options.onStarted,
        onEnded: options.onEnded,
        fallbackHtml: () => {
          if (!this.playHtmlFallback(url, tierIndex, volume, token, callbacks)) {
            if (typeof options.fallbackFn === "function") options.fallbackFn();
          }
        }
      };
      const ctx = this.ensureCtx();
      if (!ctx) {
        return this.playHtmlFallback(url, tierIndex, volume, token, callbacks);
      }

      const cached = this.bufMap.get(tierIndex);
      if (cached) {
        return this.playDecodedBuffer(ctx, cached, tierIndex, volume, token, callbacks);
      }

      this.decodeTier(tierIndex).then((decoded) => {
        if (this.muted || token !== this.playToken) return;
        if (decoded) {
          this.playDecodedBuffer(ctx, decoded, tierIndex, volume, token, callbacks);
        } else if (!this.playHtmlFallback(url, tierIndex, volume, token, callbacks)) {
          if (typeof options.fallbackFn === "function") options.fallbackFn();
        }
      });
      return true;
    },

    playPreview(tierIndex) {
      if (this.muted) return false;
      return this.playTierVoice(tierIndex, { force: true, volume: 0.96 });
    },

    playDrop(tierIndex) {
      const ctx = this.ensureCtx();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(170, now + 0.085);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        osc.connect(gain);
        gain.connect(this.getOutNode(ctx));
        osc.start(now);
        osc.stop(now + 0.1);
      }
      // 最小阶位 Lv.1 奶鼠掉落时播放专属「奶鼠奶鼠！」音效（带节流保护，不打断高阶语音）
      if (tierIndex === 0) {
        const nowMs = performance.now();
        if (nowMs - this.lastMouseDropAt >= 1200) {
          if (this.playTierVoice(0, { volume: 0.88 })) {
            this.lastMouseDropAt = nowMs;
          }
        }
      }
    },

    playMerge(tierIndex, combo) {
      const ctx = this.ensureCtx();
      if (ctx) {
        const now = ctx.currentTime;
        const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
        const baseFreq = scale[Math.min(tierIndex, scale.length - 1)] * (1 + Math.min((combo || 1) - 1, 5) * 0.05);

        [1, 1.5].forEach((mult, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = i === 0 ? "triangle" : "sine";
          osc.frequency.setValueAtTime(baseFreq * mult * 0.92, now + i * 0.025);
          osc.frequency.exponentialRampToValueAtTime(baseFreq * mult, now + i * 0.025 + 0.065);
          gain.gain.setValueAtTime(i === 0 ? 0.095 : 0.045, now + i * 0.025);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18 + i * 0.03);
          osc.connect(gain);
          gain.connect(this.getOutNode(ctx));
          osc.start(now + i * 0.025);
          osc.stop(now + 0.22);
        });
      }
      this.playTierVoice(tierIndex, { volume: 0.94 });
    },

    playFanfare() {
      const ctx = this.ensureCtx();
      if (ctx) {
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        notes.forEach((freq, idx) => {
          const t = now + idx * 0.065;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.11, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(this.getOutNode(ctx));
          osc.start(t);
          osc.stop(t + 0.3);
        });
      }
      // 合出终极 Lv.11 奶蛙 / 双蛙飞升 -> 强制播放最正宗奶蛙大笑原声！
      this.playTierVoice(10, { force: true, volume: 0.98, fallbackFn: () => this.playSynthLaugh() });
    },

    playSynthLaugh() {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const hops = [
        { t: 0.0, f1: 260, f2: 430 },
        { t: 0.09, f1: 320, f2: 560 },
        { t: 0.18, f1: 360, f2: 640 },
        { t: 0.28, f1: 310, f2: 520 }
      ];
      hops.forEach((h) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1100, now + h.t);
        osc.frequency.setValueAtTime(h.f1, now + h.t);
        osc.frequency.exponentialRampToValueAtTime(h.f2, now + h.t + 0.065);
        gain.gain.setValueAtTime(0.09, now + h.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + h.t + 0.085);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.getOutNode(ctx));
        osc.start(now + h.t);
        osc.stop(now + h.t + 0.09);
      });
    },

    playLaugh(opts) {
      if (this.muted) return { played: false, muted: true, durationMs: 2400 };
      const options = opts || {};
      const nowMs = performance.now();
      // 连点防掐断：刚开笑 <420ms 内不粗暴重截，让“喝哈哈哈”顺滑响完
      if (
        this.activeVoice &&
        this.activeVoice.tier === 10 &&
        nowMs < this.activeVoice.endAtMs &&
        nowMs - this.activeVoice.startedAtMs < 420
      ) {
        if (typeof options.onEnded === "function") this.activeVoice.onEnded = options.onEnded;
        const remainMs = Math.max(900, Math.round(this.activeVoice.endAtMs - nowMs));
        return { played: true, continued: true, durationMs: remainMs };
      }
      if (
        this.activeHtmlMeta &&
        this.activeHtmlAudio &&
        !this.activeHtmlAudio.paused &&
        this.activeHtmlMeta.tier === 10 &&
        nowMs - this.activeHtmlMeta.startedAtMs < 420
      ) {
        if (typeof options.onEnded === "function") this.activeHtmlMeta.onEnded = options.onEnded;
        const remainMs = Math.max(900, Math.round(this.activeHtmlMeta.endAtMs - nowMs));
        return { played: true, continued: true, durationMs: remainMs };
      }
      const ok = this.playTierVoice(10, {
        force: true,
        volume: 0.98,
        onStarted: options.onStarted,
        onEnded: options.onEnded,
        fallbackFn: () => this.playSynthLaugh()
      });
      return { played: !!ok, continued: false, durationMs: 3450 };
    },

    playCheese() {
      this.playPowerup();
      this.playTierVoice(0, { force: true, volume: 0.94 });
    },

    playPowerup() {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.18);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));
      osc.start(now);
      osc.stop(now + 0.24);
    },

    playShake() {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const beats = [
        { t: 0.0, f0: 155, f1: 360, nf0: 520, nf1: 1450, vol: 0.18 },
        { t: 0.21, f0: 180, f1: 420, nf0: 1350, nf1: 580, vol: 0.16 },
        { t: 0.42, f0: 170, f1: 390, nf0: 600, nf1: 1550, vol: 0.14 },
        { t: 0.64, f0: 205, f1: 480, nf0: 1200, nf1: 680, vol: 0.11 }
      ];

      // Prebuild a short white-noise buffer for tactile pool-slosh swishes
      const sr = ctx.sampleRate || 44100;
      const nLen = Math.floor(sr * 0.16);
      const nBuf = ctx.createBuffer(1, nLen, sr);
      const ch = nBuf.getChannelData(0);
      for (let i = 0; i < nLen; i++) {
        ch[i] = (Math.random() * 2 - 1) * (1 - i / nLen);
      }

      beats.forEach((b) => {
        const start = now + b.t;
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(b.f0, start);
        osc.frequency.exponentialRampToValueAtTime(b.f1, start + 0.11);
        osc.frequency.exponentialRampToValueAtTime(b.f0 * 0.85, start + 0.17);
        og.gain.setValueAtTime(0.001, start);
        og.gain.linearRampToValueAtTime(b.vol, start + 0.025);
        og.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
        osc.connect(og);
        og.connect(this.getOutNode(ctx));
        osc.start(start);
        osc.stop(start + 0.19);

        const noise = ctx.createBufferSource();
        noise.buffer = nBuf;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.Q.value = 2.4;
        filter.frequency.setValueAtTime(b.nf0, start);
        filter.frequency.exponentialRampToValueAtTime(b.nf1, start + 0.14);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, start);
        ng.gain.linearRampToValueAtTime(b.vol * 0.55, start + 0.03);
        ng.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        noise.connect(filter);
        filter.connect(ng);
        ng.connect(this.getOutNode(ctx));
        noise.start(start);
        noise.stop(start + 0.16);
      });
    }
  };

  SoundFX.init();
  window.NAIWA_SFX = SoundFX;

  // --- 全站背景音乐引擎（支持 人鱼的眼泪 DJ版 / 原版 / 关闭，支持后台持续播放、OS 媒体控制与实时调音）---
  const BGMPlayer = {
    audio: null,
    trackId: "dj",
    volume: 0.38,
    prevVolume: 0.38,
    muted: false,
    paused: false,
    playing: false,
    waitingGesture: false,
    currentTime: 0,
    duration: 0,
    listeners: new Set(),
    gestureBound: false,
    playSeq: 0,

    getTracks() {
      const list = window.NAIWA_DATA && window.NAIWA_DATA.BGM_TRACKS;
      if (Array.isArray(list) && list.length) return list;
      return [
        { id: "dj", name: "人鱼的眼泪 (DJ版)", shortName: "人鱼DJ", icon: "🎧", subtitle: "豆奶/奶龙热梗小曲 · 128 BPM", src: "/assets/audio/bgm_mermaid_dj.mp3", durationSec: 125.7 },
        { id: "orig", name: "人鱼的眼泪 (原版)", shortName: "人鱼原版", icon: "🌊", subtitle: "EXO 中文原版 · 经典深情旋律", src: "/assets/audio/bgm_mermaid_orig.mp3", durationSec: 230.9 },
        { id: "off", name: "关闭背景音乐", shortName: "关BGM", icon: "🔇", subtitle: "关闭 BGM，仅保留奶家人音效", src: null, durationSec: 0 }
      ];
    },

    getTrack(id) {
      const tracks = this.getTracks();
      return tracks.find((t) => t.id === id) || tracks[0];
    },

    init() {
      try {
        const savedTrack = localStorage.getItem(LS_BGM_TRACK);
        if (savedTrack && this.getTracks().some((t) => t.id === savedTrack)) {
          this.trackId = savedTrack;
        }
        const savedVol = parseFloat(localStorage.getItem(LS_BGM_VOL));
        if (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) {
          this.volume = savedVol;
          if (savedVol > 0.02) this.prevVolume = savedVol;
        }
        this.muted = localStorage.getItem(LS_BGM_MUTE) === "1" || this.volume <= 0.001;
      } catch (e) {}

      const el = new Audio();
      el.loop = true;
      el.preload = "none";
      this.audio = el;
      this.applyVolume();

      el.addEventListener("play", () => {
        this.playing = true;
        this.paused = false;
        this.waitingGesture = false;
        this.updateMediaSession();
        this.emitChange();
      });
      el.addEventListener("pause", () => {
        this.playing = false;
        this.updateMediaSession();
        this.emitChange();
      });
      el.addEventListener("loadedmetadata", () => {
        if (isFinite(el.duration) && el.duration > 0) {
          this.duration = el.duration;
          this.emitChange();
        }
      });
      el.addEventListener("timeupdate", () => {
        this.currentTime = el.currentTime || 0;
        if (isFinite(el.duration) && el.duration > 0) this.duration = el.duration;
        this.emitChange();
      });
      el.addEventListener("error", () => {
        this.playing = false;
        this.emitChange();
      });

      this.bindMediaSessionHandlers();

      if (this.trackId !== "off") {
        const tr = this.getTrack(this.trackId);
        if (tr && tr.src) {
          this.duration = tr.durationSec || 0;
          el.src = tr.src;
          this.waitingGesture = true;
          this.bindFirstGestureUnlock();
          // 若浏览器允许自动播放则直接无缝开播，否则静默等待用户首次页面交互后自动开播
          this.tryStartAudio(false);
        }
      }
    },

    onChange(fn) {
      if (typeof fn === "function") this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    emitChange() {
      const snap = this.getState();
      this.listeners.forEach((fn) => {
        try {
          fn(snap);
        } catch (e) {}
      });
    },

    getState() {
      const tr = this.getTrack(this.trackId);
      return {
        trackId: this.trackId,
        track: tr,
        volume: this.volume,
        muted: this.muted,
        paused: this.paused,
        playing: this.playing,
        waitingGesture: this.waitingGesture,
        currentTime: this.currentTime,
        duration: this.duration || (tr && tr.durationSec) || 0
      };
    },

    getEffectiveAudioVolume() {
      if (this.muted || this.volume <= 0.001) return 0;
      // 1.35 幂次响应曲线，低音量区间调节更细腻、不炸耳
      return Math.max(0, Math.min(1, Math.pow(this.volume, 1.35)));
    },

    applyVolume() {
      if (!this.audio) return;
      this.audio.volume = this.getEffectiveAudioVolume();
    },

    savePrefs() {
      try {
        localStorage.setItem(LS_BGM_TRACK, this.trackId);
        localStorage.setItem(LS_BGM_VOL, this.volume.toFixed(3));
        localStorage.setItem(LS_BGM_MUTE, this.muted ? "1" : "0");
      } catch (e) {}
    },

    bindFirstGestureUnlock() {
      if (this.gestureBound) return;
      this.gestureBound = true;
      const onGesture = (e) => {
        if (!this.waitingGesture || this.trackId === "off" || this.paused) {
          cleanup();
          return;
        }
        const target = e && e.target;
        if (
          target &&
          target.closest &&
          target.closest(
            '[data-bgm-track="off"], #audio-panel-toggle, #audio-mute-all, #audio-bgm-mute, #game-bgm-mute, #audio-bgm-playbtn, #game-bgm-playbtn, .audio-mixer-popover'
          )
        ) {
          return;
        }
        cleanup();
        this.tryStartAudio(false);
      };
      const cleanup = () => {
        this.gestureBound = false;
        document.removeEventListener("pointerdown", onGesture, false);
        document.removeEventListener("keydown", onGesture, false);
      };
      document.addEventListener("pointerdown", onGesture, false);
      document.addEventListener("keydown", onGesture, false);
    },

    tryStartAudio(fromUserAction) {
      if (!this.audio || this.trackId === "off") return Promise.resolve(false);
      const tr = this.getTrack(this.trackId);
      if (!tr || !tr.src) return Promise.resolve(false);
      const fullUrl = new URL(tr.src, window.location.href).href;
      if (this.audio.src !== fullUrl) {
        this.audio.src = tr.src;
        this.currentTime = 0;
        this.duration = tr.durationSec || 0;
      }
      this.applyVolume();
      const seq = ++this.playSeq;
      try {
        const pr = this.audio.play();
        if (pr && typeof pr.then === "function") {
          return pr
            .then(() => {
              if (seq !== this.playSeq) return false;
              this.waitingGesture = false;
              this.paused = false;
              this.playing = true;
              this.updateMediaSession();
              this.emitChange();
              return true;
            })
            .catch(() => {
              if (seq !== this.playSeq) return false;
              this.playing = false;
              if (!fromUserAction && this.trackId !== "off" && !this.paused) {
                this.waitingGesture = true;
                this.bindFirstGestureUnlock();
              }
              this.emitChange();
              return false;
            });
        }
        return Promise.resolve(true);
      } catch (e) {
        return Promise.resolve(false);
      }
    },

    selectTrack(id, opts) {
      const options = opts || {};
      const tr = this.getTrack(id);
      if (!tr) return;
      this.trackId = tr.id;
      if (tr.id === "off") {
        this.playSeq += 1;
        this.waitingGesture = false;
        this.paused = false;
        this.playing = false;
        this.currentTime = 0;
        this.duration = 0;
        if (this.audio) {
          try {
            this.audio.pause();
            this.audio.currentTime = 0;
          } catch (e) {}
        }
        this.savePrefs();
        this.updateMediaSession();
        this.emitChange();
        return;
      }

      if (options.userInitiated && (this.muted || this.volume <= 0.01)) {
        this.muted = false;
        if (this.volume <= 0.01) {
          this.volume = this.prevVolume > 0.02 ? this.prevVolume : 0.38;
        }
      }
      this.paused = false;
      this.waitingGesture = false;
      this.currentTime = 0;
      this.duration = tr.durationSec || 0;
      if (this.audio) {
        const fullUrl = new URL(tr.src, window.location.href).href;
        if (this.audio.src !== fullUrl) {
          this.audio.src = tr.src;
          this.audio.currentTime = 0;
        }
      }
      this.savePrefs();
      this.applyVolume();
      this.tryStartAudio(!!options.userInitiated);
      this.emitChange();
    },

    togglePlay() {
      if (this.trackId === "off") {
        this.selectTrack("dj", { userInitiated: true });
        return;
      }
      if (this.playing) {
        this.playSeq += 1;
        this.paused = true;
        this.waitingGesture = false;
        if (this.audio) {
          try {
            this.audio.pause();
          } catch (e) {}
        }
        this.playing = false;
        this.updateMediaSession();
        this.emitChange();
      } else {
        if (this.muted || this.volume <= 0.01) {
          this.muted = false;
          if (this.volume <= 0.01) this.volume = this.prevVolume > 0.02 ? this.prevVolume : 0.38;
        }
        this.paused = false;
        this.savePrefs();
        this.tryStartAudio(true);
      }
    },

    setVolume(val) {
      const v = Math.max(0, Math.min(1, Number(val)));
      if (!isFinite(v)) return;
      this.volume = v;
      if (v > 0.01) {
        this.prevVolume = v;
        this.muted = false;
      } else {
        this.muted = true;
      }
      this.applyVolume();
      this.savePrefs();
      this.emitChange();
    },

    setMuted(val) {
      this.muted = !!val;
      if (!this.muted && this.volume <= 0.01) {
        this.volume = this.prevVolume > 0.02 ? this.prevVolume : 0.38;
      }
      this.applyVolume();
      this.savePrefs();
      this.emitChange();
    },

    seekRatio(ratio) {
      if (!this.audio || this.trackId === "off") return;
      const dur = isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.duration;
      if (!dur) return;
      const t = Math.max(0, Math.min(dur - 0.1, ratio * dur));
      try {
        this.audio.currentTime = t;
        this.currentTime = t;
        this.emitChange();
      } catch (e) {}
    },

    bindMediaSessionHandlers() {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.setActionHandler("play", () => {
          if (this.trackId === "off") this.selectTrack("dj", { userInitiated: true });
          else this.tryStartAudio(true);
        });
        navigator.mediaSession.setActionHandler("pause", () => {
          if (this.playing) this.togglePlay();
        });
        navigator.mediaSession.setActionHandler("previoustrack", () => {
          this.selectTrack(this.trackId === "orig" ? "dj" : "orig", { userInitiated: true });
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          this.selectTrack(this.trackId === "dj" ? "orig" : "dj", { userInitiated: true });
        });
      } catch (e) {}
    },

    updateMediaSession() {
      if (!("mediaSession" in navigator)) return;
      try {
        const tr = this.getTrack(this.trackId);
        if (this.trackId === "off" || !tr || !tr.src) {
          navigator.mediaSession.playbackState = "none";
          return;
        }
        if (typeof window.MediaMetadata === "function") {
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: tr.name,
            artist: "奶蛙导航站 · NAIWA HUB",
            album: "奶家人宇宙背景电台",
            artwork: [{ src: "/assets/chars/11_naiwa.jpg", sizes: "512x512", type: "image/jpeg" }]
          });
        }
        navigator.mediaSession.playbackState = this.playing ? "playing" : "paused";
      } catch (e) {}
    }
  };

  BGMPlayer.init();
  window.NAIWA_BGM = BGMPlayer;

  function calcMass(radius) {
    return Math.pow(radius, 1.35);
  }

  class MergeNaiwaGame {
    constructor(canvas, ui) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ui = ui || {};
      this.tiers = window.NAIWA_DATA.FAMILY_TIERS;
      this.images = [];
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.orbs = [];
      this.particles = [];
      this.popups = [];
      this.nextId = 1;

      this.score = 0;
      this.bestScore = this.loadBest();
      this.unlocked = this.loadUnlocked();
      this.runMaxTier = 0;
      this.dropCount = 0;

      this.aimX = W / 2;
      this.currentTier = 0;
      this.nextTier = 1;
      this.lastDropAt = -9999;
      this.lastDroppedOrbId = 0;
      this.queuedDrop = false;
      this.gameOver = false;
      this.dangerTimer = 0;
      this.shakeGrace = 0;
      this.shakeTime = 0;
      this.shakeDuration = SHAKE_DURATION;
      this.shakeDir = 1;
      this.shakeMerges = 0;
      this.shakeReportTimer = 0;
      this.shakeLastBeat = -1;
      this.comboCount = 0;
      this.lastMergeAt = -9999;
      this.shakeLeft = 2;
      this.cheeseLeft = 2;
      this.naiwaCelebrated = false;

      this.isDragging = false;
      this.activePointerId = null;
      this.rafId = null;
      this.lastFrame = 0;

      this.setupCanvas();
      this.preloadImages();
      this.bindEvents();
      this.reset(true);
      this.loop(performance.now());
    }

    loadBest() {
      try {
        return parseInt(localStorage.getItem(LS_BEST) || "0", 10) || 0;
      } catch (e) {
        return 0;
      }
    }

    saveBest(val) {
      try {
        localStorage.setItem(LS_BEST, String(val));
      } catch (e) {}
    }

    setRemoteBest(remoteBest) {
      const val = parseInt(remoteBest, 10) || 0;
      if (val > this.bestScore) {
        this.bestScore = val;
        this.saveBest(val);
        this.syncHUD();
      }
    }

    loadUnlocked() {
      try {
        const arr = JSON.parse(localStorage.getItem(LS_UNLOCKED) || "[0]");
        return new Set(Array.isArray(arr) ? arr : [0]);
      } catch (e) {
        return new Set([0]);
      }
    }

    saveUnlocked() {
      try {
        localStorage.setItem(LS_UNLOCKED, JSON.stringify(Array.from(this.unlocked)));
      } catch (e) {}
    }

    setupCanvas() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = W * this.dpr;
      this.canvas.height = H * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    preloadImages() {
      this.images = this.tiers.map((t) => {
        const img = new Image();
        img.decoding = "async";
        img.src = t.img;
        return img;
      });
    }

    rollNextTier() {
      const maxSpawn = this.dropCount < 4 ? 2 : this.dropCount < 10 ? 3 : 4;
      const weights = [34, 28, 20, 12, 6].slice(0, maxSpawn + 1);
      const sum = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return 0;
    }

    reset(silent) {
      if (!silent && !this.gameOver && this.score > 0 && this.ui.onProgress) {
        this.ui.onProgress({
          score: this.score,
          maxTier: this.runMaxTier + 1,
          final: true
        });
      }

      this.orbs = [];
      this.particles = [];
      this.popups = [];
      this.score = 0;
      this.runMaxTier = 0;
      this.dropCount = 0;
      this.aimX = W / 2;
      this.currentTier = 0; // Start cleanly with Lv.1 奶鼠
      this.nextTier = 1; // Followed by Lv.2 奶蛋
      this.lastDropAt = -9999;
      this.lastDroppedOrbId = 0;
      this.queuedDrop = false;
      this.gameOver = false;
      this.dangerTimer = 0;
      this.shakeGrace = 0;
      this.shakeTime = 0;
      this.shakeDuration = SHAKE_DURATION;
      this.shakeDir = 1;
      this.shakeMerges = 0;
      this.shakeReportTimer = 0;
      this.shakeLastBeat = -1;
      this.comboCount = 0;
      this.lastMergeAt = -9999;
      this.shakeLeft = 2;
      this.cheeseLeft = 2;
      this.naiwaCelebrated = false;
      this.isDragging = false;
      this.activePointerId = null;

      if (this.ui.overlay) this.ui.overlay.hidden = true;
      this.syncHUD();
      this.syncLadder();
      if (!silent && this.ui.onToast) {
        this.ui.onToast("新的一局开始啦！从最小奶鼠冲向终极奶蛙 🐸");
      }
    }

    clampAim(x) {
      const r = this.tiers[this.currentTier].radius;
      return Math.max(WALL + r + 2, Math.min(W - WALL - r - 2, x));
    }

    canvasPointFromEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = W / (rect.width || W);
      const scaleY = H / (rect.height || H);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        outside:
          e.clientX < rect.left - 48 ||
          e.clientX > rect.right + 48 ||
          e.clientY < rect.top - 48 ||
          e.clientY > rect.bottom + 48
      };
    }

    bindEvents() {
      this.canvas.addEventListener("pointerdown", (e) => {
        if (this.gameOver) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        SoundFX.ensureCtx();
        if (this.canvas.focus) {
          try {
            this.canvas.focus({ preventScroll: true });
          } catch (_) {
            this.canvas.focus();
          }
        }
        if (this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        const pt = this.canvasPointFromEvent(e);
        this.aimX = this.clampAim(pt.x);
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (this.gameOver) return;
        if (e.pointerType === "mouse" || (this.isDragging && e.pointerId === this.activePointerId)) {
          const pt = this.canvasPointFromEvent(e);
          this.aimX = this.clampAim(pt.x);
        }
      });

      this.canvas.addEventListener("pointerup", (e) => {
        if (this.gameOver) return;
        if (this.isDragging && e.pointerId === this.activePointerId) {
          const pt = this.canvasPointFromEvent(e);
          this.isDragging = false;
          this.activePointerId = null;
          if (e.pointerType !== "mouse" && pt.outside) {
            return;
          }
          this.aimX = this.clampAim(pt.x);
          this.requestDrop();
        }
      });

      this.canvas.addEventListener("pointercancel", () => {
        this.isDragging = false;
        this.activePointerId = null;
      });

      window.addEventListener("resize", () => {
        const newDpr = Math.min(window.devicePixelRatio || 1, 2);
        if (newDpr !== this.dpr) this.setupCanvas();
      });

      // Keyboard controls: Left/Right/A/D to aim, Space/Enter/Down/S to drop
      window.addEventListener("keydown", (e) => {
        if (this.gameOver) return;
        const active = document.activeElement;
        const tag = (active && active.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((tag === "BUTTON" || tag === "A") && active !== this.canvas && (e.key === " " || e.key === "Enter")) {
          return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const inView = rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.15;
        if (!inView) return;

        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          e.preventDefault();
          this.aimX = this.clampAim(this.aimX - 18);
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          e.preventDefault();
          this.aimX = this.clampAim(this.aimX + 18);
        } else if (
          e.key === "ArrowDown" ||
          e.key === "s" ||
          e.key === "S" ||
          ((e.key === " " || e.key === "Enter") && active === this.canvas)
        ) {
          e.preventDefault();
          this.requestDrop();
        }
      });
    }

    isReadyToDrop(now) {
      if (this.gameOver) return false;
      if (now - this.lastDropAt < DROP_COOLDOWN_MS) return false;
      if (this.lastDroppedOrbId) {
        const prev = this.orbs.find((o) => o.id === this.lastDroppedOrbId);
        if (prev && !prev.hasTouched && prev.y - prev.r < SPAWN_Y + 18 && now - this.lastDropAt < 650) {
          return false;
        }
      }
      return true;
    }

    requestDrop() {
      const now = performance.now();
      if (this.gameOver) return;
      if (this.isReadyToDrop(now)) {
        this.drop(now);
      } else if (now - this.lastDropAt >= DROP_COOLDOWN_MS - DROP_BUFFER_WINDOW_MS) {
        this.queuedDrop = true;
      }
    }

    drop(now = performance.now()) {
      if (!this.isReadyToDrop(now)) return;
      this.lastDropAt = now;
      this.queuedDrop = false;

      const t = this.tiers[this.currentTier];
      const x = this.clampAim(this.aimX);
      const jitter = (Math.random() - 0.5) * 1.2;

      // Avoid spawning directly inside an unusually high transient orb
      let spawnY = SPAWN_Y;
      for (const o of this.orbs) {
        const dx = Math.abs(o.x - x);
        const minD = o.r + t.radius + 1;
        if (dx < minD) {
          const safeY = o.y - Math.sqrt(Math.max(0, minD * minD - dx * dx)) - 1;
          if (safeY < spawnY) {
            spawnY = Math.max(t.radius + 4, safeY);
          }
        }
      }

      const newId = this.nextId++;
      this.lastDroppedOrbId = newId;

      this.orbs.push({
        id: newId,
        tier: this.currentTier,
        x: x + jitter,
        y: spawnY,
        vx: jitter * 5,
        vy: 36,
        r: t.radius,
        targetR: t.radius,
        mass: calcMass(t.radius),
        angle: 0,
        angVel: (Math.random() - 0.5) * 0.7,
        scale: 1,
        age: 0,
        hasTouched: false,
        merging: false
      });

      const prevSize = this.unlocked.size;
      this.unlocked.add(this.currentTier);
      if (this.unlocked.size !== prevSize) {
        this.saveUnlocked();
      }
      this.runMaxTier = Math.max(this.runMaxTier, this.currentTier);
      this.dropCount += 1;
      SoundFX.playDrop(this.currentTier);

      this.currentTier = this.nextTier;
      this.nextTier = this.rollNextTier();
      this.aimX = this.clampAim(this.aimX);
      this.syncHUD();
      this.syncLadder();
    }

    spawnShakeSplashes(dir) {
      const sideX = dir > 0 ? WALL + 14 : W - WALL - 14;
      const palette = ["#4ADE80", "#FFE259", "#86EFAC", "#FFFFFF"];
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          x: sideX + (Math.random() - 0.5) * 18,
          y: DANGER_Y + 60 + Math.random() * (H - DANGER_Y - 100),
          vx: dir * (130 + Math.random() * 190),
          vy: -80 - Math.random() * 150,
          size: 3 + Math.random() * 4.5,
          color: palette[i % palette.length],
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6
        });
      }
    }

    useShake() {
      if (this.gameOver || this.shakeLeft <= 0 || this.shakeTime > 0) return;
      if (this.orbs.length === 0) {
        if (this.ui.onToast) this.ui.onToast("池塘里还没有奶家人呢，先丢几个下去吧 🐸");
        return;
      }
      if (this.orbs.length < 2) {
        if (this.ui.onToast) this.ui.onToast("池塘里只有 1 个奶家人，多丢几个再摇更划算 🐸");
        return;
      }

      this.shakeLeft -= 1;
      this.shakeDuration = SHAKE_DURATION;
      this.shakeTime = SHAKE_DURATION;
      this.shakeGrace = SHAKE_GRACE_SEC;
      this.dangerTimer = 0;
      this.shakeDir = Math.random() < 0.5 ? 1 : -1;
      this.shakeMerges = 0;
      this.shakeReportTimer = 1.95;
      this.shakeLastBeat = 0;

      SoundFX.playShake();

      // Detect smaller orbs wedged between nearby same-tier pairs so shaking pops them free
      const blockerIds = new Set();
      for (let i = 0; i < this.orbs.length; i++) {
        const a = this.orbs[i];
        if (a.merging) continue;
        for (let j = i + 1; j < this.orbs.length; j++) {
          const b = this.orbs[j];
          if (b.merging || a.tier !== b.tier) continue;
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          const gap = dist - (a.r + b.r);
          if (gap > 0 && gap < 155) {
            const mx = (a.x + b.x) * 0.5;
            const my = (a.y + b.y) * 0.5;
            const corridorR = Math.max(a.r, gap * 0.72) + 28;
            for (const c of this.orbs) {
              if (c.id === a.id || c.id === b.id || c.merging) continue;
              if (c.tier < a.tier && Math.hypot(c.x - mx, c.y - my) < corridorR + c.r) {
                blockerIds.add(c.id);
              }
            }
          }
        }
      }

      // Strong breakaway launch: small & trapped orbs leap high; big orbs lift and slosh coherently
      for (const o of this.orbs) {
        if (o.merging || !o.hasTouched) continue;
        const lightness = Math.max(0.46, Math.min(1.7, 42 / o.targetR));
        const headroom = Math.max(0.22, Math.min(1.0, (o.y - o.r - (DANGER_Y + 8)) / 170));
        const blockerBoost = blockerIds.has(o.id) ? 1.45 : 1.0;

        const upKick = (265 + Math.random() * 145) * lightness * headroom * blockerBoost;
        o.vy = Math.max(-680, Math.min(o.vy, 0) - upKick);
        o.vx +=
          this.shakeDir * (240 + Math.random() * 150) * (0.72 + 0.35 * lightness) +
          (Math.random() - 0.5) * 140;
        o.angVel += this.shakeDir * (4.5 + Math.random() * 5.5);
      }

      this.spawnShakeSplashes(this.shakeDir);
      this.spawnPopup(W / 2, H * 0.42, "🌀 强力摇一摇！！", "#27B36B", 23);
      this.syncHUD();
    }

    useCheeseBait() {
      if (this.gameOver || this.cheeseLeft <= 0) return;
      const mice = this.orbs.filter((o) => o.tier === 0 && !o.merging);
      if (mice.length === 0) {
        if (this.ui.onToast) this.ui.onToast("桶里现在没有 Lv.1 奶鼠，留着奶酪晚点再用吧 🧀");
        return;
      }
      this.cheeseLeft -= 1;
      SoundFX.playCheese();
      const bonus = mice.length * 4;
      for (const m of mice) {
        this.spawnBurst(m.x, m.y, "#FFE57F", 12);
        this.spawnPopup(m.x, m.y - 8, "🧀 叛变 +4!", "#D97706", 15);
      }
      this.orbs = this.orbs.filter((o) => !(o.tier === 0 && !o.merging));
      this.addScore(bonus);
      if (this.ui.onToast) this.ui.onToast(`成功用奶酪收买了 ${mice.length} 只奶鼠（+${bonus}分）！🧀`);
      this.syncHUD();
    }

    spawnBurst(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const sp = 70 + Math.random() * 190;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          size: 3 + Math.random() * 5,
          color: i % 3 === 0 ? "#FFFFFF" : color,
          life: 0.45 + Math.random() * 0.35,
          maxLife: 0.8
        });
      }
    }

    spawnConfetti() {
      const palette = ["#FFE259", "#4ADE80", "#FF7EA5", "#60A5FA", "#F97316", "#A78BFA"];
      for (let i = 0; i < 72; i++) {
        this.particles.push({
          x: W * (0.15 + Math.random() * 0.7),
          y: H * (0.1 + Math.random() * 0.35),
          vx: (Math.random() - 0.5) * 340,
          vy: -140 - Math.random() * 240,
          size: 4 + Math.random() * 6,
          color: palette[i % palette.length],
          life: 1.1 + Math.random() * 0.9,
          maxLife: 2.0,
          confetti: true
        });
      }
    }

    spawnPopup(x, y, text, color, size) {
      this.popups.push({
        x: Math.max(54, Math.min(W - 54, x)),
        y: Math.max(40, y),
        text,
        color,
        size: size || 17,
        life: 0.95,
        maxLife: 0.95
      });
    }

    addScore(points) {
      this.score += points;
      let beatBest = false;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.saveBest(this.bestScore);
        beatBest = true;
      }
      if (beatBest && this.ui.onProgress) {
        this.ui.onProgress({
          score: this.score,
          maxTier: this.runMaxTier + 1,
          final: false
        });
      }
    }

    clampOrbBounds(o, applyResponse, isShaking) {
      const rest = isShaking ? 0.48 : RESTITUTION;
      if (o.x - o.r < WALL) {
        o.x = WALL + o.r;
        if (o.vx < 0) {
          o.vx = applyResponse ? -o.vx * rest : 0;
          if (applyResponse) o.angVel += o.vy * 0.0018;
        }
      } else if (o.x + o.r > W - WALL) {
        o.x = W - WALL - o.r;
        if (o.vx > 0) {
          o.vx = applyResponse ? -o.vx * rest : 0;
          if (applyResponse) o.angVel -= o.vy * 0.0018;
        }
      }

      if (o.y + o.r > H - FLOOR) {
        o.y = H - FLOOR - o.r;
        o.hasTouched = true;
        if (applyResponse) {
          if (o.vy > 0) {
            const minBounce = isShaking ? 20 : 38;
            o.vy = o.vy < minBounce ? 0 : -o.vy * rest;
          }
          o.vx *= isShaking ? 0.996 : 0.984;
          o.angVel = o.vx / Math.max(o.r, 14);
        } else if (o.vy > 0) {
          o.vy = 0;
        }
      }

      // Ceiling safety so settled orbs can never be launched off-screen above the canvas
      if (o.hasTouched && o.y - o.r < 4) {
        o.y = o.r + 4;
        if (o.vy < 0) o.vy = 0;
      }
    }

    processMerges(toMerge, now) {
      const removeIds = new Set();
      const spawned = [];
      let shouldNotify = false;

      for (const [a, b] of toMerge) {
        if (removeIds.has(a.id) || removeIds.has(b.id)) continue;
        removeIds.add(a.id);
        removeIds.add(b.id);

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;

        if (now - this.lastMergeAt < 1200) {
          this.comboCount += 1;
        } else {
          this.comboCount = 1;
        }
        this.lastMergeAt = now;
        if (this.shakeGrace > 0) {
          this.shakeMerges += 1;
        }

        if (a.tier < this.tiers.length - 1) {
          const nextIdx = a.tier + 1;
          const nt = this.tiers[nextIdx];
          const initScale = 0.78;
          const initR = nt.radius * 0.88;
          const clampedX = Math.max(WALL + nt.radius, Math.min(W - WALL - nt.radius, mx));
          const clampedY = Math.max(nt.radius + 6, Math.min(H - FLOOR - nt.radius, my));
          const avgVx = Math.max(-180, Math.min(180, (a.vx + b.vx) * 0.2));
          const avgVy = Math.max(-42, Math.min(35, (a.vy + b.vy) * 0.18 - 18));

          spawned.push({
            id: this.nextId++,
            tier: nextIdx,
            x: clampedX,
            y: clampedY,
            vx: avgVx,
            vy: avgVy,
            r: initR,
            targetR: nt.radius,
            mass: calcMass(nt.radius),
            angle: 0,
            angVel: (Math.random() - 0.5) * 1.2,
            scale: initScale,
            age: 0.35,
            hasTouched: true,
            merging: false
          });

          const bonus = Math.round(nt.score * (1 + Math.min(this.comboCount - 1, 5) * 0.25));
          this.unlocked.add(nextIdx);
          this.saveUnlocked();
          if (nextIdx > this.runMaxTier) {
            this.runMaxTier = nextIdx;
            if (nextIdx >= 5) shouldNotify = true;
          }
          this.addScore(bonus);

          this.spawnBurst(clampedX, clampedY, nt.color, nextIdx >= 8 ? 26 : 14);
          const comboTxt = this.comboCount >= 2 ? ` x${this.comboCount}` : "";
          this.spawnPopup(
            clampedX,
            clampedY - nt.radius * 0.45,
            `${nt.name} +${bonus}${comboTxt}`,
            nt.ring,
            nextIdx >= 8 ? 20 : 16
          );

          if (nextIdx === this.tiers.length - 1) {
            SoundFX.playFanfare();
            this.spawnConfetti();
            shouldNotify = true;
            if (!this.naiwaCelebrated) {
              this.naiwaCelebrated = true;
              if (this.ui.onToast) {
                this.ui.onToast("🎉 恭喜合出终极真神【Lv.11 奶蛙】！全网呼叫奶家人！！🐸");
              }
            }
          } else {
            SoundFX.playMerge(nextIdx, this.comboCount);
          }
        } else {
          // 两个终极奶蛙相撞 -> 飞升湮灭大爆分！
          const mega = 2048;
          this.addScore(mega);
          shouldNotify = true;
          SoundFX.playFanfare();
          this.spawnConfetti();
          this.spawnBurst(mx, my, "#4ADE80", 42);
          this.spawnPopup(mx, my, `🐸 双蛙飞升 +${mega}!!`, "#15803D", 23);
          if (this.ui.onToast) {
            this.ui.onToast("✨ 触发传说级「双奶蛙飞升湮灭」！狂揽 +2048 分！");
          }
        }
      }

      this.orbs = this.orbs.filter((o) => !removeIds.has(o.id)).concat(spawned);
      this.syncHUD();
      this.syncLadder();

      if (shouldNotify && this.ui.onProgress) {
        this.ui.onProgress({
          score: this.score,
          maxTier: this.runMaxTier + 1,
          final: false
        });
      }
    }

    stepPhysics(dt, now) {
      if (this.queuedDrop && this.isReadyToDrop(now)) {
        this.drop(now);
      }

      const subDt = dt / SUB_STEPS;

      for (let step = 0; step < SUB_STEPS; step++) {
        const toMerge = [];
        const isShaking = this.shakeTime > 0;
        let shakeProgress = 0;
        let shakeEnv = 0;
        let shakeWave = 0;
        let shakeHop = 0;

        if (isShaking) {
          this.shakeTime = Math.max(0, this.shakeTime - subDt);
          shakeProgress = 1 - this.shakeTime / this.shakeDuration;
          shakeEnv = Math.pow(Math.max(0, 1 - shakeProgress), 0.55);
          shakeWave = Math.sin(shakeProgress * Math.PI * 7) * this.shakeDir;
          shakeHop = Math.abs(Math.sin(shakeProgress * Math.PI * 3.5));

          const beatIdx = Math.floor(shakeProgress * 4);
          if (beatIdx > this.shakeLastBeat && beatIdx < 4) {
            this.shakeLastBeat = beatIdx;
            this.spawnShakeSplashes(shakeWave >= 0 ? 1 : -1);
          }
          if (this.shakeTime <= 0) {
            this.syncHUD();
          }
        }

        const effGravity = isShaking ? GRAVITY * (1 - 0.34 * shakeEnv) : GRAVITY;

        // 1. Velocity & position integration (+ sustained multi-beat shake slosh)
        for (const o of this.orbs) {
          if (o.merging) continue;
          o.age += subDt;
          if (o.scale < 1) {
            o.scale = Math.min(1, o.scale + subDt * 6.5);
            o.r = o.targetR * (0.88 + 0.12 * o.scale);
          } else {
            o.r = o.targetR;
          }

          o.vy += effGravity * subDt;

          if (isShaking && shakeEnv > 0.02 && o.hasTouched) {
            const lightness = Math.max(0.48, Math.min(1.65, 42 / o.targetR));
            const headroom = Math.max(0.18, Math.min(1.0, (o.y - o.r - (DANGER_Y + 8)) / 170));
            const depthNorm = (o.y - H * 0.52) / (H * 0.48);
            const sloshAx =
              shakeWave * 2450 * shakeEnv * (0.85 + 0.32 * lightness) +
              shakeWave * depthNorm * 520 * shakeEnv;
            const hopAy = -shakeHop * 780 * shakeEnv * lightness * headroom;

            o.vx += sloshAx * subDt;
            o.vy += hopAy * subDt;
            o.angVel += shakeWave * 7.5 * shakeEnv * subDt;

            // Soft ceiling brake near danger line so high piles compact sideways instead of flying out
            if (o.y - o.r < DANGER_Y + 26 && o.vy < 0) {
              o.vy *= Math.pow(0.14, subDt * 10);
            }
          }

          o.vx *= isShaking ? 0.9994 : 0.9988;
          o.vy *= 0.9992;

          const spSq = o.vx * o.vx + o.vy * o.vy;
          if (spSq > MAX_SPEED * MAX_SPEED) {
            const k = MAX_SPEED / Math.sqrt(spSq);
            o.vx *= k;
            o.vy *= k;
          }

          o.x += o.vx * subDt;
          o.y += o.vy * subDt;
          o.angle += o.angVel * subDt;
          o.angVel = Math.max(-12, Math.min(12, o.angVel * 0.992));

          this.clampOrbBounds(o, true, isShaking);
        }

        // 1.5 Anti-jam swirl assistance during shake: nearby same-tier pairs drift toward each other
        // while smaller wedged blockers between them pop upward
        if (isShaking && shakeEnv > 0.08) {
          const n = this.orbs.length;
          for (let i = 0; i < n; i++) {
            const a = this.orbs[i];
            if (a.merging) continue;
            for (let j = i + 1; j < n; j++) {
              const b = this.orbs[j];
              if (b.merging || a.tier !== b.tier) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy);
              if (dist < 1) continue;
              const gap = dist - (a.r + b.r);
              const maxRange = 130 + a.r * 0.7;
              if (gap > 0 && gap < maxRange) {
                const prox = 1 - gap / maxRange;
                const nx = dx / dist;
                const ny = dy / dist;
                const pull = (300 + 820 * prox) * shakeEnv * subDt;
                a.vx += nx * pull;
                a.vy += ny * pull * 0.72;
                b.vx -= nx * pull;
                b.vy -= ny * pull * 0.72;

                const mx = (a.x + b.x) * 0.5;
                const my = (a.y + b.y) * 0.5;
                const clearR = gap * 0.55 + Math.min(a.r, 42);
                for (let k = 0; k < n; k++) {
                  if (k === i || k === j) continue;
                  const c = this.orbs[k];
                  if (c.merging || c.tier >= a.tier) continue;
                  if (Math.hypot(c.x - mx, c.y - my) < clearR + c.r) {
                    const cHead = Math.max(0.2, Math.min(1, (c.y - c.r - DANGER_Y) / 140));
                    c.vy -= 1400 * shakeEnv * cHead * subDt;
                  }
                }
              }
            }
          }
        }

        // 2. Pairwise velocity impulses + same-tier merge detection
        const activeRest = isShaking ? 0.46 : RESTITUTION;
        const restThresh = isShaking ? -16 : -48;
        const len = this.orbs.length;
        for (let i = 0; i < len; i++) {
          const a = this.orbs[i];
          if (a.merging) continue;

          for (let j = i + 1; j < len; j++) {
            const b = this.orbs[j];
            if (b.merging) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minDist = a.r + b.r;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDist * minDist) {
              a.hasTouched = true;
              b.hasTouched = true;

              if (a.tier === b.tier) {
                a.merging = true;
                b.merging = true;
                toMerge.push([a, b]);
                // Break inner loop immediately so `a` cannot triple-merge or push other orbs!
                break;
              }

              const dist = Math.sqrt(distSq);
              const nx = dist > 0.0001 ? dx / dist : 0;
              const ny = dist > 0.0001 ? dy / dist : -1;

              const invA = 1 / a.mass;
              const invB = 1 / b.mass;
              const invSum = invA + invB;

              const rvx = b.vx - a.vx;
              const rvy = b.vy - a.vy;
              const velAlongNormal = rvx * nx + rvy * ny;

              if (velAlongNormal < 0) {
                // Zero restitution on low-speed resting contacts to eliminate pile jitter
                const e = velAlongNormal < restThresh ? activeRest : 0;
                const jImp = (-(1 + e) * velAlongNormal) / invSum;
                a.vx -= jImp * nx * invA;
                a.vy -= jImp * ny * invA;
                b.vx += jImp * nx * invB;
                b.vy += jImp * ny * invB;

                const tx = -ny;
                const ty = nx;
                const vt = rvx * tx + rvy * ty;
                const jt = (-vt * (isShaking ? 0.06 : 0.12)) / invSum;
                a.vx -= jt * tx * invA;
                a.vy -= jt * ty * invA;
                b.vx += jt * tx * invB;
                b.vy += jt * ty * invB;
                a.angVel -= (jt / a.mass) * 0.025;
                b.angVel += (jt / b.mass) * 0.025;
              }
            }
          }
        }

        // 3. Apply merges right away so newly spawned orbs get position-projected cleanly
        if (toMerge.length > 0) {
          this.processMerges(toMerge, now);
        }

        // 4. Multi-iteration Gauss-Seidel position solver + boundary pinning
        // Prevents heavy orbs from crushing small floor-supported orbs or pushing orbs into walls/floor
        const nOrbs = this.orbs.length;
        for (let iter = 0; iter < POS_ITERS; iter++) {
          for (let i = 0; i < nOrbs; i++) {
            const a = this.orbs[i];
            for (let j = i + 1; j < nOrbs; j++) {
              const b = this.orbs[j];
              if (a.tier === b.tier) continue;

              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const minDist = a.r + b.r;
              const distSq = dx * dx + dy * dy;

              if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq);
                const nx = dist > 0.0001 ? dx / dist : (i % 2 === 0 ? 1 : -1) * 0.05;
                const ny = dist > 0.0001 ? dy / dist : -1;
                const overlap = minDist - dist;
                if (overlap <= 0.01) continue;

                let wA = 1 / a.mass;
                let wB = 1 / b.mass;

                // Boundary support transfer: an orb already resting on floor/wall transfers upward/inward support
                const aOnFloor = a.y + a.r >= H - FLOOR - 0.5 && ny < -0.15;
                const bOnFloor = b.y + b.r >= H - FLOOR - 0.5 && ny > 0.15;
                if (aOnFloor && !bOnFloor) wA *= 0.08;
                if (bOnFloor && !aOnFloor) wB *= 0.08;

                const wSum = wA + wB || 1;
                const corr = overlap * 0.72;
                a.x -= nx * corr * (wA / wSum);
                a.y -= ny * corr * (wA / wSum);
                b.x += nx * corr * (wB / wSum);
                b.y += ny * corr * (wB / wSum);

                // Cancel downward sinking velocity when supported from below (skip during active shake hops)
                if (!isShaking) {
                  if (aOnFloor && b.vy > 0 && ny < -0.35) {
                    b.vy *= 0.55;
                  } else if (bOnFloor && a.vy > 0 && ny > 0.35) {
                    a.vy *= 0.55;
                  }
                }
              }
            }
          }

          for (let i = 0; i < nOrbs; i++) {
            this.clampOrbBounds(this.orbs[i], false, isShaking);
          }
        }
      }

      // 4.5 Post-shake result feedback toast once the dust settles
      if (this.shakeReportTimer > 0) {
        this.shakeReportTimer = Math.max(0, this.shakeReportTimer - dt);
        if (this.shakeReportTimer <= 0 && !this.gameOver && this.ui.onToast) {
          if (this.shakeMerges >= 3) {
            this.ui.onToast(`🌀 摇一摇引爆 ${this.shakeMerges} 连合成！太解压了！🔥`);
          } else if (this.shakeMerges >= 1) {
            this.ui.onToast(`🌀 摇一摇成功破局，触发 ${this.shakeMerges} 次合成！🐸`);
          } else {
            this.ui.onToast("🌀 池塘已完成强力洗牌重排！快趁机继续合成吧");
          }
        }
      }

      // 5. Danger line check (uses simulated physics age + hasTouched + shakeGrace)
      if (this.shakeGrace > 0) {
        this.shakeGrace = Math.max(0, this.shakeGrace - dt);
      }

      let inDanger = false;
      if (this.shakeGrace <= 0) {
        for (const o of this.orbs) {
          if (o.hasTouched && o.age > 1.15 && o.y - o.r < DANGER_Y && o.vy < 110) {
            inDanger = true;
            break;
          }
        }
      }

      if (inDanger) {
        this.dangerTimer += dt;
        if (this.dangerTimer >= DANGER_LIMIT_SEC) {
          this.triggerGameOver();
        }
      } else {
        this.dangerTimer = Math.max(0, this.dangerTimer - dt * 2.5);
      }
    }

    triggerGameOver() {
      this.gameOver = true;
      this.queuedDrop = false;
      this.shakeTime = 0;
      this.shakeReportTimer = 0;
      this.syncHUD();
      const topTier = this.tiers[this.runMaxTier] || this.tiers[0];
      if (this.ui.overScore) this.ui.overScore.textContent = String(this.score);
      if (this.ui.overBest) this.ui.overBest.textContent = String(this.bestScore);
      if (this.ui.overChar) this.ui.overChar.textContent = `Lv.${topTier.level} ${topTier.name}`;
      if (this.ui.overImg) this.ui.overImg.src = topTier.img;
      if (this.ui.overlay) this.ui.overlay.hidden = false;

      if (this.ui.onProgress) {
        this.ui.onProgress({
          score: this.score,
          maxTier: this.runMaxTier + 1,
          final: true
        });
      }
    }

    stepEffects(dt) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.confetti ? 320 : 480) * dt;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);

      for (const pop of this.popups) {
        pop.y -= 42 * dt;
        pop.life -= dt;
      }
      this.popups = this.popups.filter((p) => p.life > 0);
    }

    drawOrb(x, y, r, tierIdx, angle, scale, alpha) {
      const ctx = this.ctx;
      const t = this.tiers[tierIdx];
      const img = this.images[tierIdx];
      const rad = Math.max(4, r * (scale || 1));

      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.translate(x, y);
      ctx.rotate(angle || 0);

      if (tierIdx === this.tiers.length - 1) {
        ctx.shadowColor = "rgba(39, 179, 107, 0.45)";
        ctx.shadowBlur = 16;
      }

      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, rad - 2.4), 0, Math.PI * 2);
      ctx.clip();

      if (img && img.complete && img.naturalWidth > 0) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const fitScale = Math.max((rad * 2) / iw, (rad * 2) / ih) * 1.04;
        const dw = iw * fitScale;
        const dh = ih * fitScale;
        ctx.drawImage(img, -dw / 2, -dh / 2 + rad * 0.04, dw, dh);
      } else {
        ctx.fillStyle = t.color;
        ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
        ctx.fillStyle = "#1E261F";
        ctx.font = `bold ${Math.max(10, rad * 0.55)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.name, 0, 0);
      }

      const grad = ctx.createRadialGradient(-rad * 0.32, -rad * 0.36, rad * 0.05, 0, 0, rad);
      grad.addColorStop(0, "rgba(255,255,255,0.34)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.03)");
      grad.addColorStop(1, "rgba(0,0,0,0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, rad - 1.3, 0, Math.PI * 2);
      ctx.lineWidth = tierIdx >= 9 ? 3.5 : 2.5;
      ctx.strokeStyle = t.ring;
      ctx.stroke();

      ctx.restore();
    }

    render(now) {
      const ctx = this.ctx;
      const isDark = document.documentElement.getAttribute("data-theme") === "night";

      ctx.save();
      ctx.clearRect(0, 0, W, H);

      const isShaking = this.shakeTime > 0;
      let shakeWave = 0;
      let shakeEnv = 0;
      if (isShaking) {
        const progress = 1 - this.shakeTime / this.shakeDuration;
        shakeEnv = Math.pow(Math.max(0, 1 - progress), 0.55);
        shakeWave = Math.sin(progress * Math.PI * 7) * this.shakeDir;
        const hop = Math.abs(Math.sin(progress * Math.PI * 3.5));
        const tx = shakeWave * 11 * shakeEnv;
        const ty = -hop * 6 * shakeEnv;
        const rot = shakeWave * 0.026 * shakeEnv;
        ctx.translate(W / 2 + tx, H / 2 + ty);
        ctx.rotate(rot);
        ctx.translate(-W / 2, -H / 2);
      }

      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (isDark) {
        bgGrad.addColorStop(0, "#18241C");
        bgGrad.addColorStop(1, "#121B15");
      } else {
        bgGrad.addColorStop(0, "#FFFDF5");
        bgGrad.addColorStop(1, "#FFF4CE");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-30, -30, W + 60, H + 60);

      ctx.fillStyle = isDark ? "rgba(74, 222, 128, 0.045)" : "rgba(234, 179, 8, 0.09)";
      for (let gx = 28; gx < W; gx += 36) {
        for (let gy = 130; gy < H - 20; gy += 36) {
          ctx.beginPath();
          ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const dangerPulse = this.dangerTimer > 0 ? 0.55 + 0.45 * Math.sin(now * 0.018) : 0.35;
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(WALL, DANGER_Y);
      ctx.lineTo(W - WALL, DANGER_Y);
      ctx.lineWidth = this.dangerTimer > 0 ? 2.5 : 1.5;
      ctx.strokeStyle =
        this.dangerTimer > 0
          ? `rgba(239, 68, 68, ${dangerPulse})`
          : isDark
          ? "rgba(255, 226, 89, 0.25)"
          : "rgba(217, 119, 6, 0.32)";
      ctx.stroke();
      ctx.restore();

      if (this.dangerTimer > 0.15) {
        const rem = Math.max(0, DANGER_LIMIT_SEC - this.dangerTimer).toFixed(1);
        ctx.save();
        ctx.fillStyle = "#EF4444";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`⚠️ 超线警戒 ${rem}s`, W - WALL - 8, DANGER_Y - 7);
        ctx.restore();
      } else if (this.shakeGrace > 0.15) {
        const rem = this.shakeGrace.toFixed(1);
        ctx.save();
        ctx.fillStyle = isDark ? "#4ADE80" : "#15803D";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`🛡️ 摇晃保护中 ${rem}s`, W - WALL - 8, DANGER_Y - 7);
        ctx.restore();
      }

      if (isShaking && shakeEnv > 0.05) {
        ctx.save();
        ctx.strokeStyle = isDark
          ? `rgba(74, 222, 128, ${0.42 * shakeEnv})`
          : `rgba(39, 179, 107, ${0.42 * shakeEnv})`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        const sideX = shakeWave >= 0 ? WALL + 10 : W - WALL - 10;
        const dirSign = shakeWave >= 0 ? 1 : -1;
        for (let k = 0; k < 4; k++) {
          const ly = DANGER_Y + 90 + k * 115;
          ctx.beginPath();
          ctx.moveTo(sideX, ly);
          ctx.lineTo(sideX + dirSign * (18 + 14 * Math.abs(shakeWave)), ly - 10);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Aim drop guide + preview orb (cleanly hidden while cooling down so it never overlaps the falling orb)
      if (!this.gameOver) {
        const curTier = this.tiers[this.currentTier];
        const ready = this.isReadyToDrop(now);
        const rechargePct = Math.min(1, Math.max(0, (now - this.lastDropAt) / DROP_COOLDOWN_MS));

        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(this.aimX, SPAWN_Y + curTier.radius * (ready ? 1 : 0.4));
        ctx.lineTo(this.aimX, H - FLOOR);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = isDark ? "rgba(74, 222, 128, 0.28)" : "rgba(39, 179, 107, 0.32)";
        ctx.stroke();
        ctx.restore();

        if (ready) {
          this.drawOrb(this.aimX, SPAWN_Y, curTier.radius, this.currentTier, 0, 1, 1);
        } else if (rechargePct > 0.65) {
          const popScale = 0.55 + ((rechargePct - 0.65) / 0.35) * 0.42;
          this.drawOrb(this.aimX, SPAWN_Y, curTier.radius, this.currentTier, 0, popScale, 0.65);
        }
      }

      // Bucket walls & floor rim (extended outward so shake tilt never reveals a gap behind walls)
      ctx.fillStyle = isDark ? "#283D2F" : "#F3D37A";
      ctx.fillRect(-30, DANGER_Y - 12, WALL + 30, H - DANGER_Y + 42);
      ctx.fillRect(W - WALL, DANGER_Y - 12, WALL + 30, H - DANGER_Y + 42);
      ctx.fillRect(-30, H - FLOOR, W + 60, FLOOR + 30);

      for (const o of this.orbs) {
        this.drawOrb(o.x, o.y, o.targetR, o.tier, o.angle, o.scale, 1);
      }

      for (const p of this.particles) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.confetti) {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 8);
          ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (const pop of this.popups) {
        const a = Math.min(1, (pop.life / pop.maxLife) * 1.4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = `900 ${pop.size}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = isDark ? "#121B15" : "#FFFFFF";
        ctx.strokeText(pop.text, pop.x, pop.y);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y);
        ctx.restore();
      }

      ctx.restore();
    }

    syncHUD() {
      if (this.ui.score) this.ui.score.textContent = String(this.score);
      if (this.ui.best) this.ui.best.textContent = String(this.bestScore);
      const nextT = this.tiers[this.nextTier];
      if (this.ui.nextImg && nextT) {
        this.ui.nextImg.src = nextT.img;
        this.ui.nextImg.alt = nextT.name;
      }
      if (this.ui.nextName && nextT) {
        this.ui.nextName.textContent = `Lv.${nextT.level} ${nextT.name}`;
      }
      if (this.ui.shakeCount) this.ui.shakeCount.textContent = String(this.shakeLeft);
      if (this.ui.cheeseCount) this.ui.cheeseCount.textContent = String(this.cheeseLeft);
      const shakingNow = this.shakeTime > 0 && !this.gameOver;
      if (this.ui.shakeLabel) {
        this.ui.shakeLabel.textContent = shakingNow ? "🌀 狂摇中…" : "🌀 摇一摇";
      }
      if (this.ui.shakeBtn) {
        this.ui.shakeBtn.disabled = this.shakeLeft <= 0 || this.gameOver || shakingNow;
        if (this.ui.shakeBtn.classList) {
          this.ui.shakeBtn.classList.toggle("is-shaking", shakingNow);
        }
      }
      if (this.canvas && this.canvas.parentElement && this.canvas.parentElement.classList) {
        this.canvas.parentElement.classList.toggle("is-shaking", shakingNow);
      }
      if (this.ui.cheeseBtn) this.ui.cheeseBtn.disabled = this.cheeseLeft <= 0 || this.gameOver;
    }

    syncLadder() {
      if (!this.ui.ladder) return;
      const items = this.ui.ladder.querySelectorAll("[data-tier-idx]");
      items.forEach((el) => {
        const idx = parseInt(el.getAttribute("data-tier-idx"), 10);
        const reached = this.unlocked.has(idx);
        el.classList.toggle("is-unlocked", reached);
        el.classList.toggle("is-current-max", idx === this.runMaxTier && this.dropCount > 0);
      });
      if (this.ui.unlockCount) {
        this.ui.unlockCount.textContent = `${this.unlocked.size} / ${this.tiers.length}`;
      }
    }

    loop(now) {
      if (!this.lastFrame) this.lastFrame = now;
      const dt = Math.min(Math.max(0, (now - this.lastFrame) / 1000), 1 / 30);
      this.lastFrame = now;

      if (!this.gameOver && dt > 0) {
        this.stepPhysics(dt, now);
      }
      if (dt > 0) {
        this.stepEffects(dt);
      }
      this.render(now);

      this.rafId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  window.MergeNaiwaGame = MergeNaiwaGame;
})();
