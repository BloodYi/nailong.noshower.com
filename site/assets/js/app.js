/* 奶蛙导航站 · NAIWA HUB 主交互脚本（严格无内联 JS，100% 兼容 CSP） */
(function () {
  "use strict";

  const DATA = window.NAIWA_DATA;
  const SFX = window.NAIWA_SFX;
  const BGM = window.NAIWA_BGM;

  const LS_THEME = "naiwa_theme_v1";
  const LS_LAUGHS = "naiwa_laugh_count_v1";
  const LS_FAVS = "naiwa_fav_memes_v1";

  const initialLocalLaughs = loadLaughs();

  const state = {
    memeCat: "all",
    memeQuery: "",
    memeExpanded: false,
    favs: loadFavs(),
    videoCat: "all",
    lightboxList: [],
    lightboxIdx: 0,
    laughCount: initialLocalLaughs,
    serverLaughCount: 0,
    totalLaughs: 0,
    displayTotalLaughs: 0,
    laughRankedPlayers: 0,
    totalPlayers: 0,
    scoreLeaderboard: [],
    laughLeaderboard: [],
    gameLbTab: "score",
    pendingLaughDelta: 0,
    inFlightLaughDelta: 0,
    laughInFlight: false,
    laughSyncTimer: null,
    laughMaxWaitTimer: null,
    laughSeedAttempted: false,
    laughResetTimer: null,
    laughSessionId: 0,
    lastMutedHintAt: 0,
    player: null,
    activeCharTierIdx: 0,
    refreshUniName: null,
    applyServerState: null,
    openProfileModal: null,
    queueLaughDelta: null,
    syncLaughUI: null
  };

  function getLaughTitle(count) {
    const n = Number(count) || 0;
    if (n >= 1000) return "👑 喝哈哈哈真神";
    if (n >= 666) return "🌟 池塘活佛";
    if (n >= 300) return "✨ 狂笑大宗师";
    if (n >= 120) return "🔥 电子木鱼大师";
    if (n >= 66) return "🙏 功德居士";
    if (n >= 30) return "🤣 捂肚学徒";
    if (n >= 10) return "😆 嘴角失守";
    if (n >= 1) return "🐸 初闻蛙鸣";
    return "待开笑";
  }

  function resolveAvatar(avatarVal, bestTier) {
    if (avatarVal && typeof avatarVal === "string") {
      return avatarVal;
    }
    const idx = Math.max(0, Math.min(DATA.FAMILY_TIERS.length - 1, (bestTier || 1) - 1));
    return DATA.FAMILY_TIERS[idx].img;
  }

  function loadFavs() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveFavs() {
    try {
      localStorage.setItem(LS_FAVS, JSON.stringify(Array.from(state.favs)));
    } catch (e) {}
  }

  function loadLaughs() {
    try {
      return parseInt(localStorage.getItem(LS_LAUGHS) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveLaughs(n) {
    try {
      localStorage.setItem(LS_LAUGHS, String(n));
    } catch (e) {}
  }

  // --- Toast 提示 ---
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 2600);
  }

  function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function paintRangeInput(el, pct) {
    if (!el) return;
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    el.style.setProperty("--range-pct", `${clamped}%`);
  }

  // --- 主题、背景音乐（BGM）与音量控制台 ---
  function initControls() {
    const themeBtn = document.getElementById("theme-toggle");
    const savedTheme = (() => {
      try {
        return localStorage.getItem(LS_THEME);
      } catch (e) {
        return null;
      }
    })();

    const applyTheme = (t) => {
      document.documentElement.setAttribute("data-theme", t);
      if (themeBtn) {
        themeBtn.textContent = t === "night" ? "☀️ 奶霜白昼" : "🌙 池塘夜色";
      }
      try {
        localStorage.setItem(LS_THEME, t);
      } catch (e) {}
    };

    applyTheme(savedTheme === "night" ? "night" : "cream");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme");
        applyTheme(cur === "night" ? "cream" : "night");
      });
    }

    // 声音控制台弹窗 + 游戏内 BGM 快捷条（100% 双向实时同步）
    const dockWrap = document.getElementById("audio-dock-wrap");
    const panelBtn = document.getElementById("audio-panel-toggle");
    const triggerLabel = document.getElementById("audio-trigger-label");
    const popover = document.getElementById("audio-mixer-popover");
    const mixerCloseBtn = document.getElementById("audio-mixer-close");
    const muteAllBtn = document.getElementById("audio-mute-all");

    const nowBar = document.getElementById("audio-now-bar");
    const bgmPlayBtns = [
      document.getElementById("audio-bgm-playbtn"),
      document.getElementById("game-bgm-playbtn")
    ].filter(Boolean);
    const nowStatusEl = document.getElementById("audio-now-status");
    const bgmTimeEl = document.getElementById("audio-bgm-time");
    const bgmSeekEl = document.getElementById("audio-bgm-seek");

    const bgmMuteBtns = [
      document.getElementById("audio-bgm-mute"),
      document.getElementById("game-bgm-mute")
    ].filter(Boolean);
    const bgmVolInputs = [
      document.getElementById("audio-bgm-vol"),
      document.getElementById("game-bgm-vol")
    ].filter(Boolean);
    const bgmVolVals = [
      document.getElementById("audio-bgm-vol-val"),
      document.getElementById("game-bgm-vol-val")
    ].filter(Boolean);

    const sfxMuteBtns = [
      document.getElementById("audio-sfx-mute"),
      document.getElementById("game-sfx-mute")
    ].filter(Boolean);
    const sfxVolInputs = [
      document.getElementById("audio-sfx-vol"),
      document.getElementById("game-sfx-vol")
    ].filter(Boolean);
    const sfxVolVals = [
      document.getElementById("audio-sfx-vol-val"),
      document.getElementById("game-sfx-vol-val")
    ].filter(Boolean);
    const sfxTestBtn = document.getElementById("audio-sfx-test");

    const trackBtns = Array.from(document.querySelectorAll("[data-bgm-track]"));

    let isSeeking = false;

    const positionPopover = () => {
      if (!popover || !panelBtn || popover.hidden) return;
      if (window.innerWidth <= 640) {
        const rect = panelBtn.getBoundingClientRect();
        const topPx = Math.max(54, Math.min(Math.round(rect.bottom + 8), Math.max(54, window.innerHeight - 260)));
        popover.style.top = `${topPx}px`;
      } else {
        popover.style.top = "";
      }
    };

    const setPopoverOpen = (open) => {
      if (!popover || !panelBtn) return;
      popover.hidden = !open;
      panelBtn.setAttribute("aria-expanded", open ? "true" : "false");
      panelBtn.classList.toggle("is-open", open);
      if (open) positionPopover();
    };

    if (panelBtn && popover) {
      panelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setPopoverOpen(popover.hidden);
      });
      if (mixerCloseBtn) {
        mixerCloseBtn.addEventListener("click", () => setPopoverOpen(false));
      }
      window.addEventListener("resize", positionPopover, { passive: true });
      document.addEventListener("click", (e) => {
        if (!popover.hidden && dockWrap && !dockWrap.contains(e.target)) {
          setPopoverOpen(false);
        }
      });
      document.addEventListener("keydown", (e) => {
        if (!popover.hidden && e.key === "Escape") {
          setPopoverOpen(false);
          panelBtn.focus();
        }
      });
    }

    const syncAudioUI = () => {
      const b = BGM ? BGM.getState() : { trackId: "off", volume: 0.38, muted: false, playing: false, paused: false, waitingGesture: false, currentTime: 0, duration: 0, track: null };
      const sfxMuted = SFX ? (SFX.muted || SFX.volume <= 0.001) : false;
      const sfxPct = SFX ? (sfxMuted ? 0 : Math.round(SFX.volume * 100)) : 85;
      const bgmOff = b.trackId === "off";
      const bgmAudible = !bgmOff && !b.muted && b.volume > 0.001;
      const bgmPct = b.muted ? 0 : Math.round(b.volume * 100);
      const allMuted = sfxMuted && (!bgmAudible || bgmOff);

      // 1. 顶部触发胶囊按钮状态与实时音浪动画
      if (panelBtn && triggerLabel) {
        const playingAudible = b.playing && bgmAudible;
        panelBtn.classList.toggle("is-playing", playingAudible);
        panelBtn.classList.toggle("is-muted", allMuted);
        if (allMuted) {
          triggerLabel.textContent = "🔇 已静音";
        } else if (!bgmOff && b.track) {
          const prefix = b.track.icon || "🎵";
          const suffix = b.muted ? "静音" : b.playing ? `${bgmPct}%` : b.waitingGesture ? "待播" : "暂停";
          triggerLabel.textContent = `${prefix} ${b.track.shortName} · ${suffix}`;
        } else {
          triggerLabel.textContent = `🔊 音效 ${sfxPct}%`;
        }
      }

      // 2. 一键全静音按钮
      if (muteAllBtn) {
        muteAllBtn.textContent = allMuted ? "🔊 恢复声音" : "🔇 一键静音";
        muteAllBtn.classList.toggle("is-muted", allMuted);
      }

      // 3. 3 选 1 曲目按钮状态（顶部控制台 + 游戏内置电台同步）
      trackBtns.forEach((btn) => {
        const id = btn.getAttribute("data-bgm-track");
        const active = id === b.trackId;
        btn.classList.toggle("is-active", active);
        if (btn.getAttribute("role") === "radio") {
          btn.setAttribute("aria-checked", active ? "true" : "false");
        }
        const badge = btn.querySelector(".bgm-track-badge");
        if (badge) {
          if (id === "off") {
            badge.textContent = active ? "已关闭" : "关闭";
          } else if (active) {
            badge.textContent = b.playing ? "播放中" : b.waitingGesture ? "点击即播" : "已暂停";
          } else {
            badge.textContent = "切换";
          }
        }
      });

      // 4. 播放/暂停条与进度显示
      if (nowBar) {
        nowBar.classList.toggle("is-off", bgmOff);
      }
      bgmPlayBtns.forEach((btn) => {
        if (bgmOff) {
          btn.textContent = "▶";
          btn.title = "点击播放人鱼的眼泪 (DJ版)";
          btn.classList.remove("is-playing");
        } else if (b.playing) {
          btn.textContent = "⏸";
          btn.title = "暂停背景音乐";
          btn.classList.add("is-playing");
        } else {
          btn.textContent = "▶";
          btn.title = "播放背景音乐";
          btn.classList.remove("is-playing");
        }
      });

      if (nowStatusEl) {
        if (bgmOff) {
          nowStatusEl.textContent = "背景音乐已关闭（仅保留奶家人音效）";
        } else if (b.playing && b.muted) {
          nowStatusEl.textContent = `${b.track?.name || "BGM"} · 已静音`;
        } else if (b.playing) {
          nowStatusEl.textContent = `正在循环 · ${b.track?.name || "BGM"}`;
        } else if (b.waitingGesture) {
          nowStatusEl.textContent = `已选 ${b.track?.shortName || "BGM"} · 点 ▶ 或互动页面即播`;
        } else {
          nowStatusEl.textContent = `已暂停 · ${b.track?.name || "BGM"}`;
        }
      }

      if (bgmTimeEl) {
        bgmTimeEl.textContent = bgmOff
          ? "--:-- / --:--"
          : `${formatAudioTime(b.currentTime)} / ${formatAudioTime(b.duration)}`;
      }
      if (bgmSeekEl && !isSeeking) {
        const ratio = !bgmOff && b.duration > 0 ? Math.min(1, b.currentTime / b.duration) : 0;
        const val = Math.round(ratio * 1000);
        bgmSeekEl.value = String(val);
        bgmSeekEl.disabled = bgmOff;
        paintRangeInput(bgmSeekEl, ratio * 100);
      }

      // 5. BGM 音量滑块与静音按钮
      bgmMuteBtns.forEach((btn) => {
        btn.textContent = b.muted || bgmPct === 0 ? "🔇" : bgmPct < 45 ? "🔉" : "🎵";
        btn.classList.toggle("is-muted", b.muted || bgmPct === 0);
      });
      bgmVolInputs.forEach((inp) => {
        if (document.activeElement !== inp) inp.value = String(bgmPct);
        paintRangeInput(inp, bgmPct);
      });
      bgmVolVals.forEach((el) => {
        el.textContent = `${bgmPct}%`;
      });

      // 6. 音效音量滑块与静音按钮
      sfxMuteBtns.forEach((btn) => {
        btn.textContent = sfxMuted || sfxPct === 0 ? "🔇" : sfxPct < 45 ? "🔉" : "🔊";
        btn.classList.toggle("is-muted", sfxMuted || sfxPct === 0);
      });
      sfxVolInputs.forEach((inp) => {
        if (document.activeElement !== inp) inp.value = String(sfxPct);
        paintRangeInput(inp, sfxPct);
      });
      sfxVolVals.forEach((el) => {
        el.textContent = `${sfxPct}%`;
      });
    };

    // 绑定所有曲目切换按钮
    trackBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!BGM) return;
        const id = btn.getAttribute("data-bgm-track");
        BGM.selectTrack(id, { userInitiated: true });
        if (id === "off") {
          showToast("🔇 已关闭背景音乐，仅保留奶家人音效");
        } else {
          const tr = BGM.getTrack(id);
          showToast(`${tr.icon} 背景音乐已切换：${tr.name}`);
        }
      });
    });

    // 播放 / 暂停按钮
    bgmPlayBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!BGM) return;
        BGM.togglePlay();
      });
    });

    // 进度条拖拽跳转
    if (bgmSeekEl) {
      bgmSeekEl.addEventListener("pointerdown", () => {
        isSeeking = true;
      });
      bgmSeekEl.addEventListener("input", () => {
        const ratio = Number(bgmSeekEl.value) / 1000;
        paintRangeInput(bgmSeekEl, ratio * 100);
        if (BGM && bgmTimeEl) {
          const dur = BGM.getState().duration;
          bgmTimeEl.textContent = `${formatAudioTime(ratio * dur)} / ${formatAudioTime(dur)}`;
        }
      });
      const finishSeek = () => {
        if (!BGM) return;
        const ratio = Number(bgmSeekEl.value) / 1000;
        isSeeking = false;
        BGM.seekRatio(ratio);
      };
      bgmSeekEl.addEventListener("change", finishSeek);
      bgmSeekEl.addEventListener("pointerup", () => {
        isSeeking = false;
      });
    }

    // BGM 音量滑动与静音
    bgmVolInputs.forEach((inp) => {
      inp.addEventListener("input", () => {
        if (!BGM) return;
        const pct = Number(inp.value);
        paintRangeInput(inp, pct);
        BGM.setVolume(pct / 100);
      });
    });
    bgmMuteBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!BGM) return;
        BGM.setMuted(!BGM.muted);
      });
    });

    // SFX 音量滑动、静音与试音
    sfxVolInputs.forEach((inp) => {
      inp.addEventListener("input", () => {
        if (!SFX) return;
        const pct = Number(inp.value);
        paintRangeInput(inp, pct);
        SFX.setVolume(pct / 100);
      });
    });
    sfxMuteBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!SFX) return;
        SFX.setMuted(!SFX.muted);
        if (!SFX.muted) SFX.playDrop();
      });
    });
    if (sfxTestBtn) {
      sfxTestBtn.addEventListener("click", () => {
        if (!SFX) return;
        if (SFX.muted) SFX.setMuted(false);
        SFX.playPreview(0);
      });
    }

    // 一键全静音 / 恢复声音
    if (muteAllBtn) {
      muteAllBtn.addEventListener("click", () => {
        const b = BGM ? BGM.getState() : null;
        const sfxMuted = SFX ? (SFX.muted || SFX.volume <= 0.001) : false;
        const bgmAudible = b && b.trackId !== "off" && !b.muted && b.volume > 0.001;
        const allMuted = sfxMuted && !bgmAudible;
        if (allMuted) {
          if (SFX) SFX.setMuted(false);
          if (BGM && b && b.trackId !== "off") {
            BGM.setMuted(false);
            if (!b.playing) BGM.tryStartAudio(true);
          }
          if (SFX) SFX.playDrop();
          showToast("🔊 已恢复背景音乐与奶家人音效！");
        } else {
          if (SFX) SFX.setMuted(true);
          if (BGM) BGM.setMuted(true);
          showToast("🔇 已一键静音，可以安心摸鱼 🤫");
        }
      });
    }

    if (SFX && typeof SFX.onChange === "function") SFX.onChange(syncAudioUI);
    if (BGM && typeof BGM.onChange === "function") BGM.onChange(syncAudioUI);
    syncAudioUI();
  }

  // --- Hero 互动“点一下就狂笑”镇站奶蛙 ---
  function initHeroMascot() {
    const card = document.getElementById("hero-mascot-btn");
    const avatarStage = document.getElementById("hero-mascot-stage");
    const bellyImg = document.getElementById("hero-mascot-belly");
    const twitchImg = document.getElementById("hero-mascot-twitch");
    const soundBadge = document.getElementById("hero-sound-badge");
    const hintEl = document.getElementById("hero-mascot-hint");
    const countEl = document.getElementById("laugh-counter");
    const stage = document.getElementById("danmaku-stage");
    const jumpLink = document.getElementById("mascot-lb-jump");
    if (!card || !bellyImg || !countEl) return;

    if (jumpLink) {
      jumpLink.addEventListener("pointerdown", (e) => e.stopPropagation());
      jumpLink.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = document.getElementById("laugh-leaderboard");
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    const DEFAULT_HINT = "👆 点一下奶蛙，看它捂肚狂笑！";
    const LAUGH_HINT = "🤣 喝哈哈哈！捂肚狂笑中…";
    const LANES = [
      { xMin: 0.24, xMax: 0.44, yMin: 0.16, yMax: 0.26 },
      { xMin: 0.56, xMax: 0.78, yMin: 0.16, yMax: 0.26 },
      { xMin: 0.36, xMax: 0.64, yMin: 0.12, yMax: 0.22 },
      { xMin: 0.22, xMax: 0.42, yMin: 0.34, yMax: 0.48 },
      { xMin: 0.58, xMax: 0.78, yMin: 0.34, yMax: 0.48 }
    ];
    let laneIdx = 0;
    let lastLineIdx = -1;

    countEl.textContent = String(state.laughCount);

    const stopLaughVisual = (sessionId) => {
      if (typeof sessionId === "number" && sessionId !== state.laughSessionId) return;
      clearTimeout(state.laughResetTimer);
      state.laughResetTimer = null;
      card.classList.remove("is-laughing");
      bellyImg.classList.remove("is-active");
      if (twitchImg) twitchImg.classList.remove("is-active");
      if (hintEl) hintEl.textContent = DEFAULT_HINT;
    };

    const scheduleVisualReset = (sessionId, ms) => {
      clearTimeout(state.laughResetTimer);
      state.laughResetTimer = setTimeout(() => stopLaughVisual(sessionId), Math.max(900, ms));
    };

    const spawnDanmaku = () => {
      if (!stage || !DATA.DANMAKU_LINES || DATA.DANMAKU_LINES.length === 0) return;
      // 最多同屏保留 8 条弹幕，防止连点 60 次堆叠卡顿
      while (stage.children.length >= 8) {
        stage.firstElementChild.remove();
      }
      const bubble = document.createElement("span");
      bubble.className = "danmaku-chip";
      let idx = Math.floor(Math.random() * DATA.DANMAKU_LINES.length);
      if (idx === lastLineIdx && DATA.DANMAKU_LINES.length > 1) {
        idx = (idx + 1) % DATA.DANMAKU_LINES.length;
      }
      lastLineIdx = idx;
      bubble.textContent = DATA.DANMAKU_LINES[idx];

      const lane = LANES[laneIdx % LANES.length];
      laneIdx += 1;
      const fracX = lane.xMin + Math.random() * (lane.xMax - lane.xMin);
      const fracY = lane.yMin + Math.random() * (lane.yMax - lane.yMin);
      bubble.style.top = `${Math.round(fracY * 100)}%`;
      bubble.style.left = `${Math.round(fracX * 100)}%`;
      stage.appendChild(bubble);

      // 按实际像素宽度将中心点安全夹紧在卡片内部，彻底杜绝左右裁切
      const stageW = stage.clientWidth;
      const bubbleW = bubble.offsetWidth;
      if (stageW > 0 && bubbleW > 0) {
        const margin = 14;
        const half = Math.min(bubbleW / 2, stageW / 2 - margin);
        const minX = half + margin;
        const maxX = Math.max(minX, stageW - half - margin);
        const clampedX = Math.max(minX, Math.min(maxX, fracX * stageW));
        bubble.style.left = `${Math.round(clampedX)}px`;
      }
      setTimeout(() => bubble.remove(), 1580);
    };

    const warmAudio = () => {
      if (SFX && typeof SFX.warmUp === "function") {
        SFX.warmUp(10);
      }
    };

    const triggerLaugh = () => {
      state.laughCount += 1;
      state.displayTotalLaughs = Math.max(state.displayTotalLaughs + 1, state.laughCount);
      saveLaughs(state.laughCount);
      countEl.textContent = String(state.laughCount);
      if (typeof state.syncLaughUI === "function") {
        state.syncLaughUI(true);
      }
      if (typeof state.queueLaughDelta === "function") {
        state.queueLaughDelta(1);
      }

      const sessionId = ++state.laughSessionId;

      // 切换预加载的动图层（0ms 零闪烁、零头顶裁切、绝不冻成静态图）
      const useTwitch = Boolean(twitchImg) && state.laughCount % 3 === 0;
      bellyImg.classList.toggle("is-active", !useTwitch);
      if (twitchImg) twitchImg.classList.toggle("is-active", useTwitch);

      card.classList.add("is-laughing");
      if (hintEl) hintEl.textContent = LAUGH_HINT;
      if (soundBadge) {
        soundBadge.textContent = SFX.muted ? "🔇 静音狂笑中" : "🔊 喝哈哈哈…";
      }

      if (avatarStage) {
        avatarStage.classList.remove("is-pop");
        void avatarStage.offsetWidth;
        avatarStage.classList.add("is-pop");
      }

      // 同步播放“喝哈哈哈”奶蛙大笑原声，并将动画时长与音频播放精准对齐
      const playRes = SFX.playLaugh({
        onStarted: (durMs) => {
          if (sessionId !== state.laughSessionId) return;
          scheduleVisualReset(sessionId, (durMs || 3450) + 120);
        },
        onEnded: () => {
          if (sessionId !== state.laughSessionId) return;
          stopLaughVisual(sessionId);
        }
      });

      if (playRes && playRes.muted) {
        const now = Date.now();
        if (now - state.lastMutedHintAt > 6000) {
          state.lastMutedHintAt = now;
          showToast("🔇 奶家人音效已静音，点击右上角声音控制台即可开启「喝哈哈哈」！")
        }
        scheduleVisualReset(sessionId, 2400);
      } else {
        scheduleVisualReset(sessionId, ((playRes && playRes.durationMs) || 3450) + 220);
      }

      spawnDanmaku();
    };

    card.addEventListener("pointerdown", (e) => {
      if (e.target && e.target.closest && e.target.closest("#mascot-lb-jump")) return;
      warmAudio();
    }, { passive: true });
    card.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("#mascot-lb-jump")) return;
      triggerLaugh();
    });
    card.addEventListener("keydown", (e) => {
      if (e.target && e.target.closest && e.target.closest("#mascot-lb-jump")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        warmAudio();
        triggerLaugh();
      }
    });
  }

  // --- 试听单个奶家人专属原声 ---
  function playTierSample(tier, idx, triggerEl) {
    if (!tier || typeof idx !== "number") return;
    if (SFX.muted) {
      showToast("当前音效已静音，请先点右上角声音控制台或游戏下方调大音效音量 🔊");
      return;
    }
    SFX.playPreview(idx);
    if (triggerEl) {
      triggerEl.classList.remove("is-playing");
      void triggerEl.offsetWidth;
      triggerEl.classList.add("is-playing");
      setTimeout(() => triggerEl.classList.remove("is-playing"), 900);
    }
    const label = tier.audioLabel ? ` ${tier.audioLabel}` : "";
    showToast(`🔊 Lv.${tier.level} ${tier.name}${label}`);
  }

  // --- 《合成大奶蛙》游戏初始化 ---
  function initGameSection() {
    const ladder = document.getElementById("evo-ladder");
    if (ladder) {
      ladder.innerHTML = "";
      DATA.FAMILY_TIERS.forEach((t, idx) => {
        const item = document.createElement("div");
        item.className = "evo-step";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.setAttribute("data-tier-idx", String(idx));
        item.title = `点击查看 Lv.${t.level} ${t.name} 档案`;

        const img = document.createElement("img");
        img.src = t.img;
        img.alt = t.name;
        img.loading = "lazy";

        const meta = document.createElement("div");
        meta.className = "evo-meta";
        const nameEl = document.createElement("span");
        nameEl.className = "evo-name";
        nameEl.textContent = `Lv.${t.level} ${t.name}`;
        const ptsEl = document.createElement("span");
        ptsEl.className = "evo-pts";
        ptsEl.textContent = `+${t.score}分`;
        meta.append(nameEl, ptsEl);

        const tag = document.createElement("span");
        tag.className = "evo-badge";
        tag.textContent = idx === 0 ? "最小" : idx === DATA.FAMILY_TIERS.length - 1 ? "终极最大" : t.rank.split("·")[0].trim();

        const sfxBtn = document.createElement("button");
        sfxBtn.type = "button";
        sfxBtn.className = "evo-sfx-btn";
        sfxBtn.textContent = "🔊";
        sfxBtn.title = `试听 ${t.name} 专属原声：${t.audioLabel || ""}`;
        sfxBtn.setAttribute("aria-label", `试听 ${t.name} 专属原声`);
        sfxBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          playTierSample(t, idx, sfxBtn);
        });

        item.append(img, meta, tag, sfxBtn);
        item.addEventListener("click", () => openCharModal(t, idx));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCharModal(t, idx);
          }
        });
        ladder.appendChild(item);
      });
    }

    const canvas = document.getElementById("merge-canvas");
    if (!canvas || !window.MergeNaiwaGame) return;

    let game = null;
    let scoreSyncTimer = null;
    let pendingPayload = null;

    function createRankRow(row, mode) {
      const tierIdx = Math.max(0, Math.min(DATA.FAMILY_TIERS.length - 1, (row.bestTier || 1) - 1));
      const tierObj = DATA.FAMILY_TIERS[tierIdx];
      const isLaugh = mode === "laugh";
      const displayLaughs = isLaugh
        ? (row.isMe ? Math.max(Number(row.laughCount) || 0, state.laughCount) : (Number(row.laughCount) || 0))
        : (Number(row.laughCount) || 0);

      const el = document.createElement("div");
      el.className = "ip-lb-row" + (row.isMe ? " is-me" : "") + (isLaugh ? " is-laugh-row" : "");
      el.setAttribute("data-rank", String(row.rank));
      el.setAttribute("data-lb-mode", mode);

      const rk = document.createElement("span");
      rk.className = "ip-lb-rank";
      rk.textContent = String(row.rank);

      const av = document.createElement("img");
      av.className = "ip-lb-avatar";
      av.src = resolveAvatar(row.avatar, row.bestTier);
      av.alt = row.name;
      av.loading = "lazy";

      const main = document.createElement("div");
      main.className = "ip-lb-main";

      const top = document.createElement("div");
      top.className = "ip-lb-top";

      const nm = document.createElement("span");
      nm.className = "ip-lb-name";
      nm.textContent = row.name;
      top.appendChild(nm);

      if (row.isMe) {
        const meTag = document.createElement("span");
        meTag.className = "ip-lb-me-badge";
        meTag.textContent = "本IP";
        top.appendChild(meTag);

        const editInline = document.createElement("button");
        editInline.type = "button";
        editInline.className = "ip-lb-edit-inline";
        editInline.textContent = "✏️ 改";
        editInline.title = "更换头像与名字";
        editInline.addEventListener("click", () => {
          if (typeof state.openProfileModal === "function") {
            state.openProfileModal();
          }
        });
        top.appendChild(editInline);
      }

      const sub = document.createElement("div");
      sub.className = "ip-lb-sub";

      const ipTag = document.createElement("span");
      ipTag.className = "ip-lb-ip";
      ipTag.textContent = `IP ${row.maskedIp || "*.*.*.*"}`;

      const tr = document.createElement("span");
      tr.className = isLaugh ? "ip-lb-tier ip-lb-merit-title" : "ip-lb-tier";
      tr.textContent = isLaugh ? getLaughTitle(displayLaughs) : `Lv.${tierObj.level} ${tierObj.name}`;

      sub.append(ipTag, tr);
      main.append(top, sub);

      const sc = document.createElement("span");
      sc.className = isLaugh ? "ip-lb-score ip-lb-laugh-val" : "ip-lb-score";
      sc.textContent = isLaugh
        ? `${displayLaughs} 次`
        : (row.bestScore > 0 ? `${row.bestScore}分` : "热身中");

      el.append(rk, av, main, sc);
      return el;
    }

    function syncLaughUI(fromClick) {
      const countEl = document.getElementById("laugh-counter");
      if (countEl) {
        countEl.textContent = String(state.laughCount);
      }

      const rankPill = document.getElementById("mascot-laugh-rank");
      if (rankPill) {
        if (state.player && state.player.laughRank) {
          rankPill.textContent = `🏆 全服第 #${state.player.laughRank} · ${getLaughTitle(state.laughCount)}`;
        } else if (state.laughCount > 0) {
          rankPill.textContent = `✨ ${getLaughTitle(state.laughCount)} · 同步上榜中…`;
        } else {
          rankPill.textContent = "🙏 点击攒功德上全服榜";
        }
      }

      const globalEl = document.getElementById("laugh-global-total");
      if (globalEl) {
        globalEl.textContent = String(state.displayTotalLaughs);
      }

      const mySummaryEl = document.getElementById("laugh-my-summary");
      if (mySummaryEl) {
        mySummaryEl.textContent = "";
        if (state.player && state.player.laughRank) {
          mySummaryEl.append(document.createTextNode("我的排名 "));
          const strong = document.createElement("strong");
          strong.textContent = `#${state.player.laughRank} · ${state.laughCount} 次`;
          mySummaryEl.appendChild(strong);
        } else if (state.laughCount > 0) {
          mySummaryEl.append(document.createTextNode("我的功德 "));
          const strong = document.createElement("strong");
          strong.textContent = `${state.laughCount} 次`;
          mySummaryEl.appendChild(strong);
        } else {
          mySummaryEl.append(document.createTextNode("我的排名 "));
          const strong = document.createElement("strong");
          strong.textContent = "待上榜";
          mySummaryEl.appendChild(strong);
        }
      }

      if (fromClick) {
        document.querySelectorAll('.ip-lb-row.is-me[data-lb-mode="laugh"]').forEach((rowEl) => {
          const valEl = rowEl.querySelector(".ip-lb-laugh-val");
          if (valEl) {
            valEl.textContent = `${state.laughCount} 次`;
            valEl.classList.remove("is-bump");
            void valEl.offsetWidth;
            valEl.classList.add("is-bump");
          }
          const titleEl = rowEl.querySelector(".ip-lb-merit-title");
          if (titleEl) {
            titleEl.textContent = getLaughTitle(state.laughCount);
          }
        });
      }
    }

    function renderLaughLeaderboard() {
      const listEl = document.getElementById("laugh-leaderboard-list");
      const pinEl = document.getElementById("laugh-lb-my-pin");
      if (!listEl) return;

      listEl.innerHTML = "";
      if (!state.laughLeaderboard || state.laughLeaderboard.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ip-lb-empty laugh-lb-empty";
        empty.textContent = "虚位以待！点一下上方镇站奶蛙，立刻修得全服第一份狂笑功德 🤣";
        listEl.appendChild(empty);
      } else {
        state.laughLeaderboard.forEach((row) => {
          listEl.appendChild(createRankRow(row, "laugh"));
        });
      }

      if (pinEl) {
        const p = state.player;
        const inTop = state.laughLeaderboard.some((r) => r.isMe);
        if (p && p.laughRank && !inTop) {
          pinEl.innerHTML = "";
          const label = document.createElement("div");
          label.className = "laugh-lb-pin-label";
          label.textContent = "我的当前狂笑功德排名";
          const myRow = createRankRow({
            rank: p.laughRank,
            name: p.name,
            avatar: p.avatar,
            maskedIp: p.maskedIp,
            bestTier: p.bestTier,
            laughCount: Math.max(p.laughCount || 0, state.laughCount),
            isMe: true
          }, "laugh");
          pinEl.append(label, myRow);
          pinEl.hidden = false;
        } else {
          pinEl.hidden = true;
          pinEl.innerHTML = "";
        }
      }
    }

    function renderGameLeaderboard() {
      const lbList = document.getElementById("ip-leaderboard-list");
      const totalEl = document.getElementById("ip-total-count");
      const titleEl = document.getElementById("ip-lb-title");
      const isLaughTab = state.gameLbTab === "laugh";

      if (titleEl) {
        titleEl.textContent = isLaughTab ? "🙏 累计狂笑功德排行榜" : "🏆 独立 IP 挑战者风云榜";
      }
      if (totalEl) {
        totalEl.textContent = isLaughTab
          ? `已上榜 ${state.laughRankedPlayers} 位`
          : `已记录 ${state.totalPlayers} 位`;
      }

      if (!lbList) return;
      lbList.innerHTML = "";

      const rows = isLaughTab ? state.laughLeaderboard : state.scoreLeaderboard;
      if (!rows || rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ip-lb-empty";
        empty.textContent = isLaughTab
          ? "虚位以待！回到顶部点一下镇站奶蛙即可上功德榜 🤣"
          : "虚位以待！落下一颗奶鼠即可开启全服榜单 🐸";
        lbList.appendChild(empty);
        return;
      }

      rows.forEach((row) => {
        lbList.appendChild(createRankRow(row, isLaughTab ? "laugh" : "score"));
      });
    }

    function applyServerState(data, opts) {
      if (!data || !data.ok) return;
      const fromLaughPost = Boolean(opts && opts.fromLaughPost);
      const p = data.player;

      if (typeof data.totalPlayers === "number") {
        state.totalPlayers = data.totalPlayers;
      }
      if (typeof data.totalLaughs === "number") {
        state.totalLaughs = data.totalLaughs;
      }
      if (typeof data.laughRankedPlayers === "number") {
        state.laughRankedPlayers = data.laughRankedPlayers;
      }
      if (Array.isArray(data.leaderboard)) {
        state.scoreLeaderboard = data.leaderboard;
      }
      if (Array.isArray(data.laughLeaderboard)) {
        state.laughLeaderboard = data.laughLeaderboard;
      }

      if (p) {
        state.player = p;
        const avatarSrc = resolveAvatar(p.avatar, p.bestTier);

        const topChip = document.getElementById("topbar-player-chip");
        const topAv = document.getElementById("topbar-player-avatar");
        const topName = document.getElementById("topbar-player-name");
        const barAv = document.getElementById("player-avatar-img");
        const nameEl = document.getElementById("player-name-text");
        const metaEl = document.getElementById("player-meta-text");
        const overPlayerEl = document.getElementById("over-player");

        if (topAv) topAv.src = avatarSrc;
        if (topName) topName.textContent = p.name;
        if (topChip) {
          topChip.title = `当前独立 IP (${p.maskedIp})：${p.name}（点击自由更换头像/名字）`;
        }
        if (barAv) {
          barAv.src = avatarSrc;
          barAv.alt = p.name;
        }
        if (nameEl) {
          nameEl.textContent = p.name;
        }
        if (metaEl) {
          const rankTxt = p.rank ? ` · 全服 #${p.rank}` : " · 待上榜";
          metaEl.textContent = `IP ${p.maskedIp}${rankTxt}`;
        }
        if (overPlayerEl) {
          overPlayerEl.textContent = `${p.name} (${p.maskedIp})`;
        }
        if (game && p.bestScore > 0) {
          game.setRemoteBest(p.bestScore);
        }
        if (typeof state.refreshUniName === "function") {
          state.refreshUniName(p.name);
        }

        const srvLaughs = Number(p.laughCount) || 0;
        if (fromLaughPost) {
          state.serverLaughCount = srvLaughs;
          state.laughCount = srvLaughs + state.pendingLaughDelta;
          state.displayTotalLaughs = state.totalLaughs + state.pendingLaughDelta;
          saveLaughs(state.laughCount);
        } else {
          state.serverLaughCount = Math.max(state.serverLaughCount, srvLaughs);
          if (!state.laughInFlight && state.pendingLaughDelta === 0) {
            if (srvLaughs > 0 || state.laughSeedAttempted || initialLocalLaughs === 0) {
              state.laughCount = srvLaughs;
              saveLaughs(state.laughCount);
            }
            state.displayTotalLaughs = state.totalLaughs;
          } else {
            const effective = state.serverLaughCount + state.inFlightLaughDelta + state.pendingLaughDelta;
            state.laughCount = Math.max(state.laughCount, effective);
            state.displayTotalLaughs = Math.max(state.displayTotalLaughs, state.totalLaughs + state.pendingLaughDelta);
          }
        }
      }

      syncLaughUI(false);
      renderLaughLeaderboard();
      renderGameLeaderboard();
    }

    function flushLaughQueue(extraSeed) {
      clearTimeout(state.laughSyncTimer);
      clearTimeout(state.laughMaxWaitTimer);
      state.laughSyncTimer = null;
      state.laughMaxWaitTimer = null;

      if (state.laughInFlight) return;
      let seed = Math.max(0, Math.min(5000, Number(extraSeed) || 0));
      if (!state.laughSeedAttempted && initialLocalLaughs > 0 && seed === 0) {
        seed = Math.min(5000, initialLocalLaughs);
      }
      const batch = Math.min(30, state.pendingLaughDelta);
      if (batch <= 0 && seed <= 0) return;

      if (seed > 0) {
        state.laughSeedAttempted = true;
      }
      state.pendingLaughDelta -= batch;
      state.inFlightLaughDelta = batch;
      state.laughInFlight = true;

      fetch("/api/naiwa/laugh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ delta: batch, localSeed: seed })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          state.inFlightLaughDelta = 0;
          state.laughInFlight = false;
          if (data && data.ok) {
            applyServerState(data, { fromLaughPost: true });
          } else {
            state.pendingLaughDelta = Math.min(300, state.pendingLaughDelta + batch);
          }
          if (state.pendingLaughDelta > 0) {
            flushLaughQueue(0);
          }
        })
        .catch(() => {
          state.inFlightLaughDelta = 0;
          state.laughInFlight = false;
          state.pendingLaughDelta = Math.min(300, state.pendingLaughDelta + batch);
        });
    }

    function queueLaughDelta(n) {
      const add = Math.max(0, Number(n) || 0);
      if (add <= 0) return;
      state.pendingLaughDelta += add;
      clearTimeout(state.laughSyncTimer);
      state.laughSyncTimer = setTimeout(() => flushLaughQueue(0), 260);
      if (!state.laughMaxWaitTimer) {
        state.laughMaxWaitTimer = setTimeout(() => flushLaughQueue(0), 700);
      }
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.pendingLaughDelta > 0) {
        flushLaughQueue(0);
      }
    });

    window.addEventListener("pagehide", () => {
      if (state.pendingLaughDelta > 0 && navigator.sendBeacon) {
        const batch = Math.min(30, state.pendingLaughDelta);
        state.pendingLaughDelta -= batch;
        const blob = new Blob([JSON.stringify({ delta: batch })], { type: "application/json" });
        navigator.sendBeacon("/api/naiwa/laugh", blob);
      }
    });

    state.applyServerState = applyServerState;
    state.queueLaughDelta = queueLaughDelta;
    state.syncLaughUI = syncLaughUI;

    // 排行榜 Tab 切换（游戏侧边栏）
    document.querySelectorAll("[data-lb-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-lb-tab") === "laugh" ? "laugh" : "score";
        state.gameLbTab = tab;
        document.querySelectorAll("[data-lb-tab]").forEach((b) => {
          const active = b.getAttribute("data-lb-tab") === tab;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderGameLeaderboard();
      });
    });

    // 刷新累计狂笑功德榜按钮
    const laughRefreshBtn = document.getElementById("laugh-lb-refresh");
    if (laughRefreshBtn) {
      laughRefreshBtn.addEventListener("click", () => {
        if (laughRefreshBtn.disabled) return;
        laughRefreshBtn.disabled = true;
        laughRefreshBtn.classList.add("is-loading");
        fetch("/api/naiwa/leaderboard", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && data.ok) {
              applyServerState(data);
              showToast("🙏 已刷新最新累计狂笑功德榜！");
            } else {
              showToast("刷新失败，请稍后再试 🌐");
            }
          })
          .catch(() => showToast("网络异常，刷新未成功 🌐"))
          .finally(() => {
            laughRefreshBtn.disabled = false;
            laughRefreshBtn.classList.remove("is-loading");
          });
      });
    }

    function postScoreToServer(payload) {
      fetch("/api/naiwa/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) applyServerState(data);
        })
        .catch(() => {});
    }

    function scheduleScoreSync(info) {
      if (!info) return;
      if (info.final) {
        clearTimeout(scoreSyncTimer);
        pendingPayload = null;
        postScoreToServer(info);
        return;
      }
      pendingPayload = info;
      clearTimeout(scoreSyncTimer);
      scoreSyncTimer = setTimeout(() => {
        if (pendingPayload) {
          const p = pendingPayload;
          pendingPayload = null;
          postScoreToServer(p);
        }
      }, 1200);
    }

    game = new window.MergeNaiwaGame(canvas, {
      score: document.getElementById("game-score"),
      best: document.getElementById("game-best"),
      nextImg: document.getElementById("game-next-img"),
      nextName: document.getElementById("game-next-name"),
      shakeCount: document.getElementById("shake-count"),
      shakeLabel: document.getElementById("shake-label"),
      cheeseCount: document.getElementById("cheese-count"),
      shakeBtn: document.getElementById("btn-shake"),
      cheeseBtn: document.getElementById("btn-cheese"),
      ladder,
      unlockCount: document.getElementById("unlock-count"),
      overlay: document.getElementById("game-overlay"),
      overScore: document.getElementById("over-score"),
      overBest: document.getElementById("over-best"),
      overChar: document.getElementById("over-char"),
      overImg: document.getElementById("over-img"),
      onToast: showToast,
      onProgress: scheduleScoreSync
    });

    // Fetch & bind unique IP anime identity on load; also migrate prior local laugh count & best score if needed
    fetch("/api/naiwa/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        applyServerState(data);
        if (game && game.bestScore > (data.player?.bestScore || 0)) {
          const maxUnlocked = Math.max(0, ...Array.from(game.unlocked)) + 1;
          postScoreToServer({
            score: game.bestScore,
            maxTier: maxUnlocked,
            final: false
          });
        }
        if ((data.player?.laughCount || 0) === 0 && initialLocalLaughs > 0 && !state.laughSeedAttempted) {
          state.laughSeedAttempted = true;
          flushLaughQueue(Math.min(5000, initialLocalLaughs));
        } else {
          state.laughSeedAttempted = true;
        }
      })
      .catch(() => {
        const nameEl = document.getElementById("player-name-text");
        if (nameEl) nameEl.textContent = "原神的派蒙（离线模式）";
        const laughListEl = document.getElementById("laugh-leaderboard-list");
        if (laughListEl) {
          laughListEl.innerHTML = "";
          const empty = document.createElement("div");
          empty.className = "ip-lb-empty laugh-lb-empty";
          empty.textContent = "暂时无法连接排行榜服务，狂笑功德已保存在本机 🐸";
          laughListEl.appendChild(empty);
        }
      });

    const resetBtn = document.getElementById("btn-reset-game");
    const replayBtn = document.getElementById("btn-replay-game");
    const shakeBtn = document.getElementById("btn-shake");
    const cheeseBtn = document.getElementById("btn-cheese");

    if (resetBtn) resetBtn.addEventListener("click", () => game.reset(false));
    if (replayBtn) replayBtn.addEventListener("click", () => game.reset(false));
    if (shakeBtn) shakeBtn.addEventListener("click", () => game.useShake());
    if (cheeseBtn) cheeseBtn.addEventListener("click", () => game.useCheeseBait());
  }

  // --- 复制静态图片到剪贴板（Canvas 离屏绘制，不触发 fetch，100% 符合 CSP） ---
  function copyMemeImage(imgEl, meme) {
    const isGif = meme.file.toLowerCase().endsWith(".gif");
    if (isGif) {
      showToast("动图 GIF 请点右侧「保存」按钮直接下载发微信/QQ 🎬");
      return;
    }
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      showToast("当前浏览器不支持直接复制图片，请点击「保存」下载 📥");
      return;
    }
    if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) {
      showToast("图片正在加载中，请稍候再点一次 ⏳");
      return;
    }
    try {
      const c = document.createElement("canvas");
      c.width = imgEl.naturalWidth;
      c.height = imgEl.naturalHeight;
      const cx = c.getContext("2d");
      cx.drawImage(imgEl, 0, 0);
      c.toBlob((blob) => {
        if (!blob) {
          showToast("复制失败，请使用「保存」按钮下载 📥");
          return;
        }
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": blob })])
          .then(() => showToast(`已复制「${meme.title}」到剪贴板，快去斗图！📋`))
          .catch(() => showToast("剪贴板权限受限，请直接点「保存」下载 📥"));
      }, "image/png");
    } catch (e) {
      showToast("复制失败，请使用「保存」按钮下载 📥");
    }
  }

  // --- 奶蛙表情包大全渲染与筛选 ---
  function getFilteredMemes() {
    const q = state.memeQuery.trim().toLowerCase();
    return DATA.MEMES.filter((m) => {
      if (state.memeCat === "fav" && !state.favs.has(m.id)) return false;
      if (state.memeCat !== "all" && state.memeCat !== "fav" && m.cat !== state.memeCat) return false;
      if (!q) return true;
      const hay = (m.title + " " + m.tags.join(" ")).toLowerCase();
      return hay.includes(q);
    });
  }

  function renderMemes() {
    const grid = document.getElementById("meme-grid");
    const moreWrap = document.getElementById("meme-more-wrap");
    const moreBtn = document.getElementById("meme-more-btn");
    const countBadge = document.getElementById("meme-match-count");
    const favCount = document.getElementById("fav-tab-count");
    if (!grid) return;

    if (favCount) favCount.textContent = String(state.favs.size);

    const list = getFilteredMemes();
    state.lightboxList = list;

    if (countBadge) {
      countBadge.textContent = `共 ${list.length} 张`;
    }

    grid.innerHTML = "";

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.memeCat === "fav"
        ? "收藏夹还是空的～点任意表情包上的小心心就能收进来 ❤️"
        : "没有搜到匹配的奶蛙表情包，换个关键词（比如：狂笑、奶蛋、斜眼、名画）试试！";
      grid.appendChild(empty);
      if (moreWrap) moreWrap.hidden = true;
      return;
    }

    const limit = state.memeExpanded || state.memeQuery.trim() || state.memeCat !== "all" ? list.length : 18;
    const visible = list.slice(0, limit);

    visible.forEach((m, idx) => {
      const isGif = m.file.toLowerCase().endsWith(".gif");
      const isFav = state.favs.has(m.id);
      const src = `/assets/memes/${m.file}`;

      const card = document.createElement("article");
      card.className = "meme-card";

      const mediaBtn = document.createElement("button");
      mediaBtn.type = "button";
      mediaBtn.className = "meme-media";
      mediaBtn.setAttribute("aria-label", `查看大图：${m.title}`);

      const img = document.createElement("img");
      img.src = src;
      img.alt = m.title;
      img.loading = "lazy";
      img.decoding = "async";
      mediaBtn.appendChild(img);

      if (isGif) {
        const badge = document.createElement("span");
        badge.className = "gif-pill";
        badge.textContent = "GIF";
        mediaBtn.appendChild(badge);
      }

      mediaBtn.addEventListener("click", () => openLightbox(idx));

      const body = document.createElement("div");
      body.className = "meme-body";

      const title = document.createElement("h3");
      title.className = "meme-title";
      title.textContent = m.title;

      const tagsWrap = document.createElement("div");
      tagsWrap.className = "meme-tags";
      m.tags.slice(0, 3).forEach((tg) => {
        const s = document.createElement("span");
        s.textContent = `#${tg}`;
        tagsWrap.appendChild(s);
      });

      const actions = document.createElement("div");
      actions.className = "meme-actions";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "mini-btn";
      copyBtn.textContent = isGif ? "放大" : "复制";
      copyBtn.addEventListener("click", () => {
        if (isGif) {
          openLightbox(idx);
        } else {
          copyMemeImage(img, m);
        }
      });

      const dlLink = document.createElement("a");
      dlLink.className = "mini-btn mini-btn-accent";
      dlLink.href = src;
      dlLink.download = `${m.title}.${m.file.split(".").pop()}`;
      dlLink.textContent = "保存";

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "mini-btn mini-btn-icon" + (isFav ? " is-fav" : "");
      favBtn.textContent = isFav ? "❤️" : "🤍";
      favBtn.title = isFav ? "取消收藏" : "加入收藏";
      favBtn.addEventListener("click", () => {
        if (state.favs.has(m.id)) {
          state.favs.delete(m.id);
          showToast(`已从收藏移除「${m.title}」`);
        } else {
          state.favs.add(m.id);
          showToast(`已收藏「${m.title}」❤️`);
        }
        saveFavs();
        renderMemes();
      });

      actions.append(copyBtn, dlLink, favBtn);
      body.append(title, tagsWrap, actions);
      card.append(mediaBtn, body);
      grid.appendChild(card);
    });

    if (moreWrap && moreBtn) {
      const remain = list.length - visible.length;
      moreWrap.hidden = remain <= 0;
      if (remain > 0) {
        moreBtn.textContent = `展开剩余 ${remain} 张奶蛙表情包 ↓`;
      }
    }
  }

  function initMemeControls() {
    document.querySelectorAll("[data-meme-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.memeCat = btn.getAttribute("data-meme-cat");
        document.querySelectorAll("[data-meme-cat]").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderMemes();
      });
    });

    const search = document.getElementById("meme-search");
    if (search) {
      search.addEventListener("input", () => {
        state.memeQuery = search.value;
        renderMemes();
      });
    }

    const moreBtn = document.getElementById("meme-more-btn");
    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        state.memeExpanded = true;
        renderMemes();
      });
    }

    const randomBtn = document.getElementById("meme-random-btn");
    if (randomBtn) {
      randomBtn.addEventListener("click", () => {
        state.lightboxList = DATA.MEMES;
        const idx = Math.floor(Math.random() * DATA.MEMES.length);
        SFX.playDrop();
        openLightbox(idx);
      });
    }

    renderMemes();
  }

  // --- 灯箱预览 ---
  function openLightbox(idx) {
    const modal = document.getElementById("lightbox");
    if (!modal || !state.lightboxList.length) return;
    state.lightboxIdx = (idx + state.lightboxList.length) % state.lightboxList.length;
    updateLightbox();
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    const modal = document.getElementById("lightbox");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function updateLightbox() {
    const m = state.lightboxList[state.lightboxIdx];
    if (!m) return;
    const src = `/assets/memes/${m.file}`;
    const img = document.getElementById("lb-img");
    const title = document.getElementById("lb-title");
    const tags = document.getElementById("lb-tags");
    const dl = document.getElementById("lb-download");
    const fav = document.getElementById("lb-fav");
    const copy = document.getElementById("lb-copy");

    if (img) {
      img.src = src;
      img.alt = m.title;
    }
    if (title) title.textContent = m.title;
    if (tags) {
      tags.innerHTML = "";
      m.tags.forEach((tg) => {
        const sp = document.createElement("span");
        sp.textContent = `#${tg}`;
        tags.appendChild(sp);
      });
    }
    if (dl) {
      dl.href = src;
      dl.download = `${m.title}.${m.file.split(".").pop()}`;
    }
    if (fav) {
      const isFav = state.favs.has(m.id);
      fav.textContent = isFav ? "❤️ 已收藏" : "🤍 收藏表情";
    }
    if (copy) {
      const isGif = m.file.toLowerCase().endsWith(".gif");
      copy.hidden = isGif;
    }
  }

  function initLightbox() {
    const modal = document.getElementById("lightbox");
    if (!modal) return;

    document.getElementById("lb-close")?.addEventListener("click", closeLightbox);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLightbox();
    });
    document.getElementById("lb-prev")?.addEventListener("click", () => {
      state.lightboxIdx = (state.lightboxIdx - 1 + state.lightboxList.length) % state.lightboxList.length;
      updateLightbox();
    });
    document.getElementById("lb-next")?.addEventListener("click", () => {
      state.lightboxIdx = (state.lightboxIdx + 1) % state.lightboxList.length;
      updateLightbox();
    });
    document.getElementById("lb-copy")?.addEventListener("click", () => {
      const m = state.lightboxList[state.lightboxIdx];
      const img = document.getElementById("lb-img");
      if (m) copyMemeImage(img, m);
    });
    document.getElementById("lb-fav")?.addEventListener("click", () => {
      const m = state.lightboxList[state.lightboxIdx];
      if (!m) return;
      if (state.favs.has(m.id)) state.favs.delete(m.id);
      else state.favs.add(m.id);
      saveFavs();
      updateLightbox();
      renderMemes();
    });

    window.addEventListener("keydown", (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") {
        state.lightboxIdx = (state.lightboxIdx - 1 + state.lightboxList.length) % state.lightboxList.length;
        updateLightbox();
      } else if (e.key === "ArrowRight") {
        state.lightboxIdx = (state.lightboxIdx + 1) % state.lightboxList.length;
        updateLightbox();
      }
    });
  }

  // --- 奶家人全谱系图鉴 & 详情弹窗 ---
  function openCharModal(tier, idx) {
    const modal = document.getElementById("char-modal");
    if (!modal) return;
    const tierIdx = typeof idx === "number" ? idx : Math.max(0, (tier.level || 1) - 1);
    state.activeCharTierIdx = tierIdx;
    document.getElementById("cm-img").src = tier.img;
    document.getElementById("cm-img").alt = tier.name;
    document.getElementById("cm-level").textContent = `合成阶位 Lv.${tier.level} · +${tier.score}分`;
    document.getElementById("cm-name").textContent = `${tier.name}（${tier.en}）`;
    document.getElementById("cm-rank").textContent = tier.rank;
    document.getElementById("cm-trait").textContent = tier.trait;
    const soundBtn = document.getElementById("cm-sound-btn");
    if (soundBtn) {
      soundBtn.textContent = `🔊 试听专属原声：${tier.audioLabel || tier.name}`;
    }
    document.getElementById("cm-quote").textContent = `“${tier.quote}”`;
    document.getElementById("cm-desc").textContent = tier.desc;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeCharModal() {
    const modal = document.getElementById("char-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function initFamilySection() {
    const grid = document.getElementById("family-grid");
    if (!grid) return;
    grid.innerHTML = "";

    DATA.FAMILY_TIERS.forEach((t, idx) => {
      const card = document.createElement("article");
      card.className = "char-card" + (t.level === 11 ? " char-card-god" : "");

      const top = document.createElement("div");
      top.className = "char-top";
      const lv = document.createElement("span");
      lv.className = "char-lv";
      lv.textContent = `Lv.${t.level}`;
      const rk = document.createElement("span");
      rk.className = "char-rank";
      rk.textContent = t.rank;
      top.append(lv, rk);

      const avatar = document.createElement("div");
      avatar.className = "char-avatar";
      avatar.style.borderColor = t.ring;
      avatar.style.backgroundColor = t.bg;
      const img = document.createElement("img");
      img.src = t.img;
      img.alt = t.name;
      img.loading = "lazy";
      avatar.appendChild(img);

      const name = document.createElement("h3");
      name.className = "char-name";
      name.textContent = t.name;

      const trait = document.createElement("p");
      trait.className = "char-trait";
      trait.textContent = t.trait;

      const desc = document.createElement("p");
      desc.className = "char-desc";
      desc.textContent = t.desc;

      const sfxBtn = document.createElement("button");
      sfxBtn.type = "button";
      sfxBtn.className = "char-sfx-btn";
      sfxBtn.textContent = `🔊 ${t.audioLabel || "试听原声"}`;
      sfxBtn.title = `试听 Lv.${t.level} ${t.name} 专属合成音效`;
      sfxBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playTierSample(t, idx, sfxBtn);
      });

      card.append(top, avatar, name, trait, desc, sfxBtn);
      card.addEventListener("click", () => openCharModal(t, idx));
      grid.appendChild(card);
    });

    const modal = document.getElementById("char-modal");
    document.getElementById("cm-close")?.addEventListener("click", closeCharModal);
    document.getElementById("cm-sound-btn")?.addEventListener("click", (e) => {
      const tier = DATA.FAMILY_TIERS[state.activeCharTierIdx];
      if (tier) playTierSample(tier, state.activeCharTierIdx, e.currentTarget);
    });
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeCharModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closeCharModal();
    });
  }

  // --- 奶蛙梗科普时间轴 & 热梗词典 ---
  function initLoreSection() {
    const tl = document.getElementById("lore-timeline");
    if (tl) {
      tl.innerHTML = "";
      DATA.TIMELINE.forEach((item) => {
        const li = document.createElement("li");
        li.className = "tl-item";
        const dt = document.createElement("span");
        dt.className = "tl-date";
        dt.textContent = item.date;
        const h3 = document.createElement("h3");
        h3.className = "tl-title";
        h3.textContent = item.title;
        const p = document.createElement("p");
        p.className = "tl-text";
        p.textContent = item.text;
        li.append(dt, h3, p);
        tl.appendChild(li);
      });
    }

    const gloss = document.getElementById("glossary-grid");
    if (gloss) {
      gloss.innerHTML = "";
      DATA.GLOSSARY.forEach((g) => {
        const card = document.createElement("article");
        card.className = "gloss-card";
        const head = document.createElement("div");
        head.className = "gloss-head";
        const h3 = document.createElement("h3");
        h3.textContent = g.term;
        const tag = document.createElement("span");
        tag.className = "gloss-tag";
        tag.textContent = g.tag;
        head.append(h3, tag);

        const p = document.createElement("p");
        p.textContent = g.body;
        card.append(head, p);
        gloss.appendChild(card);
      });
    }
  }

  // --- 奶蛙二创视频导航 ---
  function renderVideos() {
    const grid = document.getElementById("video-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const list = DATA.VIDEOS.filter((v) => state.videoCat === "all" || v.cat === state.videoCat);
    list.forEach((v) => {
      const a = document.createElement("a");
      a.className = "video-card";
      a.href = `https://www.bilibili.com/video/${v.bvid}/`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "video-thumb";
      const img = document.createElement("img");
      img.src = `/assets/videos/${v.bvid}.jpg`;
      img.alt = v.title;
      img.loading = "lazy";
      img.decoding = "async";

      const badge = document.createElement("span");
      badge.className = "video-badge";
      badge.textContent = v.badge;

      const dur = document.createElement("span");
      dur.className = "video-dur";
      dur.textContent = v.duration;

      const playOverlay = document.createElement("span");
      playOverlay.className = "video-play-ico";
      playOverlay.textContent = "▶";

      thumbWrap.append(img, badge, dur, playOverlay);

      const info = document.createElement("div");
      info.className = "video-info";

      const title = document.createElement("h3");
      title.className = "video-title";
      title.textContent = v.title;

      const note = document.createElement("p");
      note.className = "video-note";
      note.textContent = v.note;

      const meta = document.createElement("div");
      meta.className = "video-meta";
      meta.innerHTML = "";
      const author = document.createElement("span");
      author.textContent = `UP · ${v.author}`;
      const stats = document.createElement("span");
      stats.className = "video-views";
      stats.textContent = `▶ ${v.views} · 👍 ${v.likes}`;
      meta.append(author, stats);

      info.append(title, note, meta);
      a.append(thumbWrap, info);
      grid.appendChild(a);
    });
  }

  function initVideos() {
    document.querySelectorAll("[data-video-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.videoCat = btn.getAttribute("data-video-cat");
        document.querySelectorAll("[data-video-cat]").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderVideos();
      });
    });
    renderVideos();
  }

  // --- 奶蛙大学录取通知书生成器（纯 Canvas PNG，零外链） ---
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function initAdmissionCard() {
    const canvas = document.getElementById("uni-canvas");
    const input = document.getElementById("uni-name-input");
    const genBtn = document.getElementById("uni-gen-btn");
    const randBtn = document.getElementById("uni-rand-btn");
    const dlBtn = document.getElementById("uni-dl-btn");
    const copyTxtBtn = document.getElementById("uni-copy-btn");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let currentCardInfo = null;

    function drawRoundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function renderCertificate(rawName, salt) {
      const name = (rawName || "").trim() || "神秘奶家人";
      const seed = hashStr(name + "::" + (salt || 0));
      const tier = DATA.FAMILY_TIERS[seed % DATA.FAMILY_TIERS.length];
      const majorObj = DATA.UNI_MAJORS[(seed >> 3) % DATA.UNI_MAJORS.length];
      const stuNo = `NW-2026-${String(1000 + (seed % 9000))}`;
      const scorePct = 88 + (seed % 12);

      currentCardInfo = { name, tier, majorObj, stuNo, scorePct };

      const img = new Image();
      img.onload = () => paint(img);
      img.onerror = () => paint(null);
      img.src = tier.img;

      function paint(portrait) {
        const CW = 900;
        const CH = 540;
        canvas.width = CW;
        canvas.height = CH;

        // Warm creamy certificate paper background
        const bg = ctx.createLinearGradient(0, 0, CW, CH);
        bg.addColorStop(0, "#FFFDF2");
        bg.addColorStop(0.55, "#FFF4C4");
        bg.addColorStop(1, "#DCFCE7");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CW, CH);

        // Decorative border frames
        ctx.strokeStyle = "#15803D";
        ctx.lineWidth = 10;
        drawRoundRect(ctx, 18, 18, CW - 36, CH - 36, 26);
        ctx.stroke();

        ctx.strokeStyle = "#EAB308";
        ctx.lineWidth = 3;
        drawRoundRect(ctx, 32, 32, CW - 64, CH - 64, 18);
        ctx.stroke();

        // Top banner pill
        ctx.fillStyle = "#15803D";
        drawRoundRect(ctx, 64, 58, 360, 44, 22);
        ctx.fill();
        ctx.fillStyle = "#FFFDF2";
        ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("🐸 NAIWA UNIVERSITY · 2026 届", 88, 87);

        // Main title
        ctx.fillStyle = "#1E261F";
        ctx.font = "900 44px system-ui, -apple-system, sans-serif";
        ctx.fillText("奶蛙大学录取通知书", 64, 162);

        // Student greeting
        ctx.fillStyle = "#3B493E";
        ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
        ctx.fillText(`${name} 同学：`, 64, 218);

        ctx.font = "500 21px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#2F3D33";
        ctx.fillText(`经星野算法考据委员会与全网奶家人一致评定，你的`, 64, 258);
        ctx.fillText(`灵魂契合角色为「Lv.${tier.level} ${tier.name}」（契合度 ${scorePct}%），`, 64, 290);
        ctx.fillText(`特破格录取你进入我校深造！`, 64, 322);

        // Info box
        ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
        drawRoundRect(ctx, 64, 348, 520, 126, 16);
        ctx.fill();
        ctx.strokeStyle = "#EAB308";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#15803D";
        ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
        ctx.fillText(`录取学院：${majorObj.college}`, 84, 386);
        ctx.fillStyle = "#B45309";
        ctx.fillText(`录取专业：${majorObj.major}`, 84, 422);
        ctx.fillStyle = "#4B5563";
        ctx.font = "500 17px system-ui, -apple-system, sans-serif";
        ctx.fillText(`校训寄语：“${majorObj.motto}”`, 84, 456);

        // Right portrait badge
        const px = 735;
        const py = 232;
        const pr = 112;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr + 8, 0, Math.PI * 2);
        ctx.fillStyle = tier.ring;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.clip();

        if (portrait) {
          const s = Math.max((pr * 2) / portrait.naturalWidth, (pr * 2) / portrait.naturalHeight);
          const dw = portrait.naturalWidth * s;
          const dh = portrait.naturalHeight * s;
          ctx.drawImage(portrait, px - dw / 2, py - dh / 2, dw, dh);
        }
        ctx.restore();

        // Character pill under avatar
        ctx.fillStyle = tier.ring;
        drawRoundRect(ctx, px - 86, py + pr + 18, 172, 40, 20);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Lv.${tier.level} ${tier.name}`, px, py + pr + 45);

        // Official red stamp
        ctx.save();
        ctx.translate(px, 444);
        ctx.rotate(-0.18);
        ctx.strokeStyle = "rgba(220, 38, 38, 0.78)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(220, 38, 38, 0.82)";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.fillText("奶蛙大学", 0, -6);
        ctx.fillText("教务处印", 0, 14);
        ctx.restore();

        // Footer serial
        ctx.textAlign = "left";
        ctx.fillStyle = "#64748B";
        ctx.font = "600 15px monospace";
        ctx.fillText(`学籍编号 ${stuNo} · nailong.noshower.com`, 64, 500);
      }
    }

    let rollSalt = 0;
    let userTypedCustom = false;
    input?.addEventListener("input", () => {
      userTypedCustom = Boolean(input.value.trim());
    });
    state.refreshUniName = (ipName) => {
      if (!ipName) return;
      if (input && !userTypedCustom && !input.value.trim()) {
        input.placeholder = `默认使用你的 IP 代号：${ipName}`;
        renderCertificate(ipName, rollSalt);
      }
    };
    renderCertificate(state.player?.name || "奶家人新生", 0);

    genBtn?.addEventListener("click", () => {
      rollSalt = 0;
      SFX.playPowerup();
      renderCertificate(input?.value || state.player?.name, rollSalt);
      showToast("🎓 奶蛙大学专属录取通知书已生成！");
    });

    randBtn?.addEventListener("click", () => {
      rollSalt += 1;
      SFX.playDrop();
      renderCertificate(input?.value || state.player?.name, rollSalt);
    });

    dlBtn?.addEventListener("click", () => {
      if (!currentCardInfo) return;
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `奶蛙大学录取通知书-${currentCardInfo.name}.png`;
      a.click();
      showToast("📥 通知书 PNG 已保存，快去群里报到！");
    });

    copyTxtBtn?.addEventListener("click", () => {
      if (!currentCardInfo) return;
      const { name, tier, majorObj, stuNo, scorePct } = currentCardInfo;
      const txt = `🎓【奶蛙大学 2026 录取喜报】恭喜 ${name} 同学以 ${scorePct}% 契合度觉醒「Lv.${tier.level} ${tier.name}」，正式被【${majorObj.college} · ${majorObj.major}】录取！（学号：${stuNo}）校训：“${majorObj.motto}” 🐸 来测测你是哪位奶家人：https://nailong.noshower.com/`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => showToast("已复制录取喜报文案，快去群里发！🎉"));
      } else {
        showToast(txt);
      }
    });
  }

  // --- 奶蛙生态与实用导航 ---
  function initNavDirectory() {
    const root = document.getElementById("nav-groups");
    if (!root) return;
    root.innerHTML = "";

    DATA.NAV_GROUPS.forEach((grp) => {
      const box = document.createElement("div");
      box.className = "nav-group";

      const head = document.createElement("div");
      head.className = "nav-group-head";
      const h3 = document.createElement("h3");
      h3.textContent = grp.group;
      const p = document.createElement("p");
      p.textContent = grp.desc;
      head.append(h3, p);

      const grid = document.createElement("div");
      grid.className = "nav-links-grid";

      grp.links.forEach((lk) => {
        const a = document.createElement("a");
        a.className = "nav-link-card";
        a.href = lk.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";

        const ico = document.createElement("span");
        ico.className = "nav-link-ico";
        ico.textContent = lk.icon;

        const body = document.createElement("div");
        body.className = "nav-link-body";
        const top = document.createElement("div");
        top.className = "nav-link-top";
        const nm = document.createElement("strong");
        nm.textContent = lk.name;
        const tg = document.createElement("span");
        tg.className = "nav-link-tag";
        tg.textContent = lk.tag;
        top.append(nm, tg);

        const ds = document.createElement("p");
        ds.textContent = lk.desc;

        body.append(top, ds);
        a.append(ico, body);
        grid.appendChild(a);
      });

      box.append(head, grid);
      root.appendChild(box);
    });
  }

  // --- 独立 IP 玩家资料编辑弹窗（自由更换头像与名字，初始保持原规则） ---
  function initProfileModal() {
    const modal = document.getElementById("profile-modal");
    const closeBtn = document.getElementById("pm-close");
    const cancelBtn = document.getElementById("pm-cancel");
    const saveBtn = document.getElementById("pm-save");
    const nameInput = document.getElementById("pm-name-input");
    const rollBtn = document.getElementById("pm-roll-anime");
    const restoreBtn = document.getElementById("pm-restore-init");
    const uploadInput = document.getElementById("pm-avatar-upload");
    const autoAvatarBtn = document.getElementById("pm-avatar-auto");
    const grid = document.getElementById("pm-avatar-grid");
    const prevAvatar = document.getElementById("pm-preview-avatar");
    const prevName = document.getElementById("pm-preview-name");
    const prevIp = document.getElementById("pm-preview-ip");

    if (!modal || !grid) return;

    // 组装预设头像库：全部 11 位奶家人 + 25 张精选动/静表情包
    const presetAvatars = [];
    DATA.FAMILY_TIERS.forEach((t) => {
      presetAvatars.push({
        src: t.img,
        label: `Lv.${t.level} ${t.name}`,
        tag: `Lv.${t.level}`
      });
    });
    const featuredMemeIds = [
      "m02", "m03", "m04", "m05", "m07", "m11", "m12", "m13", "m14", "m16",
      "m01", "m18", "m19", "m20", "m21", "m22", "m25", "m27", "m28", "m29",
      "m31", "m32", "m33", "m44", "m47"
    ];
    featuredMemeIds.forEach((id) => {
      const m = DATA.MEMES.find((x) => x.id === id);
      if (m) {
        const isGif = m.file.toLowerCase().endsWith(".gif");
        presetAvatars.push({
          src: `/assets/memes/${m.file}`,
          label: m.title,
          tag: isGif ? "GIF" : ""
        });
      }
    });

    let draftAvatar = "";
    let saving = false;

    function syncAvatarSelection() {
      const bestTier = state.player?.bestTier || 1;
      if (prevAvatar) {
        prevAvatar.src = resolveAvatar(draftAvatar, bestTier);
      }
      grid.querySelectorAll(".pm-avatar-opt").forEach((btn) => {
        btn.classList.toggle("is-selected", btn.getAttribute("data-src") === draftAvatar);
      });
    }

    function syncPreviewName() {
      if (!prevName) return;
      const v = (nameInput?.value || "").trim();
      prevName.textContent = v || state.player?.name || "奶家人";
    }

    // 渲染头像网格
    grid.innerHTML = "";
    presetAvatars.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pm-avatar-opt";
      btn.setAttribute("data-src", item.src);
      btn.title = item.label;

      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.label;
      img.loading = "lazy";
      btn.appendChild(img);

      if (item.tag) {
        const tag = document.createElement("span");
        tag.className = "pm-avatar-tag";
        tag.textContent = item.tag;
        btn.appendChild(tag);
      }

      btn.addEventListener("click", () => {
        draftAvatar = item.src;
        SFX.playDrop();
        syncAvatarSelection();
      });
      grid.appendChild(btn);
    });

    function openModal() {
      const p = state.player;
      draftAvatar = p?.avatar || "";
      if (nameInput) {
        nameInput.value = p?.name || "";
      }
      if (prevIp) {
        const ipTxt = p?.maskedIp || "*.*.*.*";
        prevIp.textContent = `IP ${ipTxt}（仅显示前两段 · 后两段已隐藏）`;
      }
      syncPreviewName();
      syncAvatarSelection();
      modal.hidden = false;
      setTimeout(() => nameInput?.focus(), 30);
    }

    function closeModal() {
      modal.hidden = true;
    }

    state.openProfileModal = openModal;

    document.getElementById("topbar-player-chip")?.addEventListener("click", openModal);
    document.getElementById("btn-avatar-edit")?.addEventListener("click", openModal);
    document.getElementById("btn-edit-profile")?.addEventListener("click", openModal);

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (!modal.hidden && e.key === "Escape") closeModal();
    });

    nameInput?.addEventListener("input", syncPreviewName);

    rollBtn?.addEventListener("click", () => {
      fetch("/api/naiwa/random-name", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.ok && d.name && nameInput) {
            nameInput.value = d.name;
            syncPreviewName();
            SFX.playDrop();
            showToast(`🎲 随机抽到：${d.name}`);
          }
        })
        .catch(() => showToast("网络开小差啦，可直接手填任意名字 ✍️"));
    });

    restoreBtn?.addEventListener("click", () => {
      const initName = state.player?.initName || state.player?.name || "";
      if (nameInput && initName) {
        nameInput.value = initName;
        syncPreviewName();
        SFX.playDrop();
        showToast(`↺ 已恢复初始代号：${initName}`);
      }
    });

    autoAvatarBtn?.addEventListener("click", () => {
      draftAvatar = "";
      SFX.playDrop();
      syncAvatarSelection();
      showToast("🏅 已设为默认：自动展示最高合成奶家人头像");
    });

    // 本地图片读取与正方形居中压缩（纯 data:image，100% 兼容严苛 CSP）
    uploadInput?.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      uploadInput.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("请选择有效的图片文件 🖼️");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast("图片不能超过 10MB 哦 📦");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!rawDataUrl) return;

        // 小体积 GIF 动图直接保留动画效果
        if (file.type === "image/gif" && rawDataUrl.length <= 92000) {
          draftAvatar = rawDataUrl;
          syncAvatarSelection();
          SFX.playPowerup();
          showToast("🎬 已载入动态 GIF 头像，点保存即可生效！");
          return;
        }

        const img = new Image();
        img.onload = () => {
          const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
          if (!side) {
            showToast("无法解析该图片，请换一张试试 🖼️");
            return;
          }
          const sx = Math.floor(((img.naturalWidth || img.width) - side) / 2);
          const sy = Math.floor(((img.naturalHeight || img.height) - side) / 2);

          const makeThumb = (targetSize, quality) => {
            const c = document.createElement("canvas");
            c.width = targetSize;
            c.height = targetSize;
            const cx = c.getContext("2d");
            cx.fillStyle = "#ffffff";
            cx.fillRect(0, 0, targetSize, targetSize);
            cx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
            let out = c.toDataURL("image/webp", quality);
            if (!out.startsWith("data:image/webp")) {
              out = c.toDataURL("image/jpeg", quality);
            }
            return out;
          };

          let compressed = makeThumb(160, 0.85);
          if (compressed.length > 90000) {
            compressed = makeThumb(128, 0.78);
          }
          if (compressed.length > 92000) {
            compressed = makeThumb(96, 0.72);
          }

          draftAvatar = compressed;
          syncAvatarSelection();
          SFX.playPowerup();
          showToast("📤 自定义头像已裁剪就绪，点击「保存」生效！");
        };
        img.onerror = () => showToast("图片读取失败，请换一张 JPG/PNG/WebP 图片 🖼️");
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });

    saveBtn?.addEventListener("click", () => {
      if (saving) return;
      const cleanName = (nameInput?.value || "").replace(/\s+/g, " ").trim();
      if (!cleanName) {
        showToast("名字不能为空哦（1~20 个字符）✍️");
        nameInput?.focus();
        return;
      }

      saving = true;
      saveBtn.disabled = true;
      fetch("/api/naiwa/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName.slice(0, 20),
          avatar: draftAvatar
        })
      })
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (!ok || !d || !d.ok) {
            showToast((d && d.message) || "保存失败，请稍后重试");
            return;
          }
          if (typeof state.applyServerState === "function") {
            state.applyServerState(d);
          }
          SFX.playPowerup();
          closeModal();
          showToast(`✅ 已保存身份：${d.player?.name || cleanName}`);
        })
        .catch(() => {
          showToast("网络异常，保存未成功，请重试 🌐");
        })
        .finally(() => {
          saving = false;
          saveBtn.disabled = false;
        });
    });
  }

  // --- 启动入口 ---
  document.addEventListener("DOMContentLoaded", () => {
    initControls();
    initHeroMascot();
    initGameSection();
    initProfileModal();
    initMemeControls();
    initLightbox();
    initFamilySection();
    initLoreSection();
    initVideos();
    initAdmissionCard();
    initNavDirectory();
  });
})();
