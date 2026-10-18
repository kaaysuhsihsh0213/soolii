/* =====================================================
   OPERATION: BACHAO MERI JAAN 😂🚨
   Vanilla JS. No dependencies, no network requests.
   ===================================================== */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var rand = function (min, max) { return Math.random() * (max - min) + min; };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = function () { return !!(motionQuery && motionQuery.matches); };

  /* ---------- state ---------- */
  var scenes = $$('.scene');
  var dots = $$('.dot');
  var progressLabel = $('#progress-label');
  var current = 0;
  var maxReached = 0;
  var busy = false;
  var revealTimers = [];   // scene text reveal timers
  var timers = [];         // other timers cleared on every scene change
  var intervals = [];      // ambient spawners
  var transitionTimers = [];
  var batteryToken = 0;
  var balanceToken = 0;

  function later(fn, ms) {
    var id = setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function clearAllTimers() {
    timers.forEach(clearTimeout); timers = [];
    revealTimers.forEach(clearTimeout); revealTimers = [];
    intervals.forEach(clearInterval); intervals = [];
  }

  /* ---------- optional sound (synthesised, off by default) ---------- */
  var sfx = (function () {
    var ctx = null;
    var on = false;

    function ensure() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try { ctx = new AC(); } catch (e) { return false; }
      }
      if (ctx.state === 'suspended' && ctx.resume) { ctx.resume(); }
      return true;
    }
    function tone(freq, start, dur, type, vol, endFreq) {
      var t0 = ctx.currentTime + start;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (endFreq) { o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur); }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    var lib = {
      siren: function () { tone(880, 0, 0.26, 'sawtooth', 0.04); tone(620, 0.28, 0.26, 'sawtooth', 0.04); tone(880, 0.56, 0.26, 'sawtooth', 0.04); },
      blip: function () { tone(660, 0, 0.07, 'square', 0.035); },
      click: function () { tone(520, 0, 0.08, 'square', 0.04); },
      slam: function () { tone(140, 0, 0.22, 'sawtooth', 0.07, 50); },
      whoosh: function () { tone(300, 0, 0.3, 'triangle', 0.05, 1200); },
      scan: function () { tone(400, 0, 1.2, 'sine', 0.03, 1500); },
      boss: function () { tone(110, 0, 0.7, 'sawtooth', 0.06, 70); tone(165, 0.1, 0.6, 'sawtooth', 0.04, 90); },
      win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.1, 0.22, 'triangle', 0.06); }); },
      fail: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, i * 0.18, 0.25, 'sawtooth', 0.04); }); },
      cash: function () { tone(988, 0, 0.1, 'square', 0.04); tone(1319, 0.1, 0.25, 'square', 0.04); }
    };
    return {
      isOn: function () { return on; },
      toggle: function () {
        if (on) { on = false; return true; }
        if (!ensure()) return false;
        on = true;
        lib.click();
        return true;
      },
      play: function (name) { if (on && ctx && lib[name]) { try { lib[name](); } catch (e) { /* ignore audio errors */ } } }
    };
  })();

  /* ---------- progress UI ---------- */
  function updateProgress() {
    dots.forEach(function (d, i) {
      d.classList.toggle('done', i < current);
      d.classList.toggle('now', i === current);
      d.disabled = i > maxReached;
      if (i === current) { d.setAttribute('aria-current', 'step'); } else { d.removeAttribute('aria-current'); }
    });
    progressLabel.textContent = 'Scene ' + (current + 1) + ' of ' + scenes.length;
    document.body.setAttribute('data-scene', String(current + 1));
  }

  /* ---------- reveal engine ---------- */
  var hooks = {
    battery: function (el, instant) { runBattery(instant); }
  };

  // keep newly revealed lines on screen when a scene is taller than the viewport
  function keepInView(el) {
    var sc = el.closest('.scene');
    if (!sc || sc.scrollHeight <= sc.clientHeight + 4) return;
    var r = el.getBoundingClientRect();
    var limit = window.innerHeight - 24;
    if (r.bottom > limit) {
      sc.scrollTo({ top: sc.scrollTop + (r.bottom - limit) + 12, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  function revealItem(el, instant) {
    el.classList.add('show');
    if (!instant) { keepInView(el); }
    var hook = el.getAttribute('data-hook');
    if (hook && hooks[hook]) { hooks[hook](el, instant); }
    var s = el.getAttribute('data-sfx');
    if (s && !instant) { sfx.play(s); }
  }

  function playScene(i) {
    var sc = scenes[i];
    var items = $$('.rv', sc);
    var t = Number(sc.getAttribute('data-lead') || 300);
    items.forEach(function (el) {
      if (reduced()) { revealItem(el, true); return; }
      revealTimers.push(setTimeout(function () { revealItem(el, false); }, t));
      t += Number(el.getAttribute('data-gap') || 650);
    });
  }

  function finishReveal() {
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    $$('.rv', scenes[current]).forEach(function (el) {
      if (!el.classList.contains('show')) { revealItem(el, true); }
    });
  }

  /* ---------- scene reset (runs every time a scene is entered) ---------- */
  function resetScene(i) {
    var sc = scenes[i];
    $$('.rv', sc).forEach(function (el) { el.classList.remove('show'); });
    $$('.btn, .choice', sc).forEach(function (b) { b.disabled = false; b.classList.remove('pressed'); });

    if (i === 2) {
      batteryToken++;
      setBattery(100);
      var layer = $('#pleas');
      if (layer) { layer.innerHTML = ''; }
    }
    if (i === 4) {
      sc.classList.remove('showing-result');
      $$('.result', sc).forEach(function (r) { r.hidden = true; });
      $('#choices').hidden = false;
      $('#choices').classList.remove('pop-in');
      $('#hearts').innerHTML = '';
      balanceToken++;
      $('#balance').textContent = '₹0.00';
    }
  }

  function clearOverlays() {
    $('#scan').hidden = true;
    $('#splash').hidden = true;
    $('#confetti').innerHTML = '';
  }

  /* ---------- scene navigation ---------- */
  function goTo(n) {
    if (busy || n === current || n < 0 || n >= scenes.length) return;
    busy = true;
    clearAllTimers();
    transitionTimers.forEach(clearTimeout);
    transitionTimers = [];

    var from = scenes[current];
    var to = scenes[n];
    from.classList.add('leaving');

    var wait = reduced() ? 0 : 500;
    transitionTimers.push(setTimeout(function () {
      from.classList.remove('is-active', 'leaving');
      clearOverlays();
      resetScene(n);
      to.scrollTop = 0;
      to.classList.add('is-active');
      if (!reduced()) { to.classList.add('entering'); }
      current = n;
      maxReached = Math.max(maxReached, n);
      updateProgress();

      transitionTimers.push(setTimeout(function () {
        to.classList.remove('entering');
        busy = false;
      }, reduced() ? 0 : 750));

      playScene(n);
      startAmbient(n);
    }, wait));
  }

  function replay() {
    maxReached = 0;
    goTo(0);
  }

  /* ---------- ambient spawners ---------- */
  function startAmbient(i) {
    if (reduced()) return;
    if (i === 2) { intervals.push(setInterval(spawnPlea, 650)); }
    if (i === 4) { intervals.push(setInterval(function () { spawnHeart(false); }, 420)); }
  }

  function spawnPlea() {
    if (document.hidden) return;
    var layer = $('#pleas');
    var frame = $('#scene-3 .photo-frame');
    if (!layer || !frame || layer.childElementCount > 14) return;
    var lw = layer.clientWidth;
    var fw = frame.offsetWidth;
    var margin = (lw - fw) / 2;
    if (margin < 30) return;   // no free space beside the photo, skip so it is never covered
    var onLeft = Math.random() < 0.5;
    var x = onLeft ? rand(2, margin - 28) : rand(lw - margin + 4, lw - 28);
    var tears = Math.random() < 0.4;
    var el = document.createElement('span');
    el.className = 'plea';
    el.textContent = tears ? '💧' : pick(['😭', '🙏', '🥺', '🥹', '😩']);
    el.style.left = x + 'px';
    el.style.top = rand(layer.clientHeight * 0.15, layer.clientHeight * (tears ? 0.55 : 0.8)) + 'px';
    el.style.setProperty('--dy', (tears ? rand(80, 160) : -rand(90, 190)) + 'px');
    el.style.setProperty('--r', rand(-18, 18) + 'deg');
    el.style.setProperty('--t', rand(3, 4.6) + 's');
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 5000);
  }

  function spawnHeart(burst) {
    if (document.hidden) return;
    var layer = $('#hearts');
    if (!layer || layer.childElementCount > 45) return;
    var el = document.createElement('span');
    el.className = 'heart';
    el.textContent = pick(['❤️', '💖', '💕', '💗', '🩷', '✨', '💘']);
    el.style.left = rand(2, 96) + '%';
    el.style.fontSize = rand(16, burst ? 44 : 32) + 'px';
    el.style.setProperty('--dx', rand(-60, 60) + 'px');
    el.style.setProperty('--r', rand(-25, 25) + 'deg');
    el.style.setProperty('--t', rand(burst ? 3 : 6, burst ? 6 : 10) + 's');
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 11000);
  }

  function confettiBurst() {
    if (reduced()) return;
    var layer = $('#confetti');
    var colors = ['#ff4fa3', '#ffcf33', '#3aa0ff', '#8a5cff', '#ff1f3d', '#2bd3a6', '#ffffff'];
    var i;
    for (i = 0; i < 80; i++) {
      var c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = rand(0, 100) + '%';
      c.style.background = pick(colors);
      c.style.setProperty('--x', rand(-120, 120) + 'px');
      c.style.setProperty('--r', rand(360, 900) + 'deg');
      c.style.setProperty('--t', rand(2.4, 4.4) + 's');
      c.style.setProperty('--w', rand(0, 0.7) + 's');
      layer.appendChild(c);
    }
    for (i = 0; i < 22; i++) { spawnHeart(true); }
    setTimeout(function () { layer.innerHTML = ''; }, 5500);
  }

  function buildFloaters() {
    var layer = $('#floaters');
    for (var i = 0; i < 16; i++) {
      var p = document.createElement('i');
      var s = rand(3, 7);
      p.style.left = rand(0, 100) + '%';
      p.style.width = p.style.height = s + 'px';
      p.style.setProperty('--dx', rand(-40, 40) + 'px');
      p.style.animationDuration = rand(12, 24) + 's';
      p.style.animationDelay = (-rand(0, 20)) + 's';
      layer.appendChild(p);
    }
  }

  /* ---------- battery (Scene 3) ---------- */
  function setBattery(v) {
    var fill = $('#batt-fill');
    var pct = $('#batt-pct');
    var bat = $('#battery');
    fill.style.setProperty('--lvl', String(Math.max(v, 0.5)));
    fill.style.setProperty('--hue', String(Math.round(Math.max(0, Math.min(120, v * 1.2)))));
    pct.textContent = (v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%';
    bat.classList.toggle('critical', v <= 0.5);
  }
  function runBattery(instant) {
    var token = ++batteryToken;
    if (instant || reduced()) { setBattery(0.5); return; }
    var start = performance.now();
    var dur = 2400;
    function step(now) {
      if (token !== batteryToken) return;
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      setBattery(p >= 1 ? 0.5 : 100 - 99.5 * eased);
      if (p < 1) { requestAnimationFrame(step); }
    }
    requestAnimationFrame(step);
  }

  /* ---------- balance counter (ice cream result) ---------- */
  function runBalance() {
    var el = $('#balance');
    var token = ++balanceToken;
    if (reduced()) { el.textContent = '₹0.00'; return; }
    var from = 49.5;
    var start = performance.now();
    var dur = 1500;
    function step(now) {
      if (token !== balanceToken) return;
      var p = Math.min(1, (now - start) / dur);
      var v = from * (1 - (1 - Math.pow(1 - p, 3)));
      el.textContent = '₹' + (p >= 1 ? '0.00' : v.toFixed(2));
      if (p < 1) { requestAnimationFrame(step); }
    }
    el.textContent = '₹' + from.toFixed(2);
    requestAnimationFrame(step);
  }

  /* ---------- Scene 5 results ---------- */
  function showResult(which) {
    var scene = scenes[4];
    var panel = $('#res-' + which);
    if (!panel) return;
    $('#choices').hidden = true;
    scene.classList.add('showing-result');
    $$('.result', scene).forEach(function (r) { r.hidden = true; });
    panel.hidden = false;
    scene.scrollTop = 0;
    try { panel.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }

    if (which === 'yes') { sfx.play('win'); confettiBurst(); }
    if (which === 'no') { sfx.play('fail'); }
    if (which === 'ice') { sfx.play('cash'); runBalance(); }
  }

  function showChoices() {
    var scene = scenes[4];
    balanceToken++;
    scene.classList.remove('showing-result');
    $$('.result', scene).forEach(function (r) { r.hidden = true; });
    var choices = $('#choices');
    choices.hidden = false;
    choices.classList.remove('pop-in');
    void choices.offsetWidth;   // restart the pop animation
    choices.classList.add('pop-in');
    scene.scrollTop = 0;
    var first = $('.choice', choices);
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  /* ---------- special transitions ---------- */
  function investigate(btn) {
    btn.disabled = true;
    $('#scan').hidden = false;
    sfx.play('scan');
    later(function () { busy = false; goTo(1); }, reduced() ? 300 : 1500);
  }
  function finalRound(btn) {
    btn.disabled = true;
    $('#splash').hidden = false;
    sfx.play('boss');
    later(function () { goTo(4); }, reduced() ? 300 : 1500);
  }

  /* ---------- event wiring ---------- */
  var actions = {
    investigate: investigate,
    next: function () { goTo(current + 1); },
    finalround: finalRound,
    choose: function (btn) { showResult(btn.getAttribute('data-result')); },
    again: showChoices,
    replay: replay
  };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (btn) {
      if (btn.disabled || busy) return;
      var fn = actions[btn.getAttribute('data-action')];
      if (!fn) return;
      sfx.play('click');
      btn.classList.add('pressed');
      setTimeout(function () { btn.classList.remove('pressed'); }, 380);
      fn(btn);
      return;
    }
    // tapping empty space fast-forwards the reveal (so nobody has to wait)
    if (e.target.closest && !e.target.closest('button, a, .hud') && !busy) { finishReveal(); }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && document.activeElement === document.body && !busy) {
      finishReveal();
    }
  });

  dots.forEach(function (d) {
    d.addEventListener('click', function () {
      var i = Number(d.getAttribute('data-scene-index'));
      if (i <= maxReached) { sfx.play('click'); goTo(i); }
    });
  });

  var soundBtn = $('#sound-toggle');
  soundBtn.addEventListener('click', function () {
    var ok = sfx.toggle();
    if (!ok) {
      soundBtn.textContent = '🔇 Sound unavailable';
      soundBtn.disabled = true;
      return;
    }
    var isOn = sfx.isOn();
    soundBtn.setAttribute('aria-pressed', String(isOn));
    soundBtn.textContent = isOn ? '🔊 Sound on' : '🔇 Sound off';
  });

  /* ---------- init ---------- */
  function wrapTrailingEmoji() {
    var re;
    try { re = new RegExp('(\\p{Extended_Pictographic}[\\uFE0F\\u200D\\p{Extended_Pictographic}]*)\\s*$', 'u'); }
    catch (e) { return; }
    $$('.wanted li, .quotes li:not(.punch)').forEach(function (li) {
      var node = li.lastChild;
      if (!node || node.nodeType !== 3) return;
      var m = re.exec(node.nodeValue);
      if (!m) return;
      var span = document.createElement('span');
      span.className = 'e';
      span.textContent = m[1];
      node.nodeValue = node.nodeValue.slice(0, m.index);
      li.appendChild(span);
    });
  }

  function init() {
    wrapTrailingEmoji();
    buildFloaters();
    updateProgress();
    resetScene(0);
    setTimeout(function () { document.body.classList.add('lit'); }, 500);
    playScene(0);
  }

  init();
})();
