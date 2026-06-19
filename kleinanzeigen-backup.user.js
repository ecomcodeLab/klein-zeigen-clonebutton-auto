// ==UserScript==
// @name          Kleinanzeigen Auto Clone Bot
// @namespace     https://github.com/ecomcodeLab/klein-zeigen-clonebutton-auto
// @description   Einfaches Duplizieren, Smart Neu-Einstellen und automatische Rotation der aeltesten Anzeigen. Inklusive Popup-Blocker.
// @icon          http://www.google.com/s2/favicons?domain=www.kleinanzeigen.de
// @copyright     2026
// @license       MIT
// @version       6.9.0
// @author        OldRon1977, ecomcodeLab
// @credits       Original-Script: J05HI https://github.com/J05HI
// @credits       Erweiterte Version: OldRon1977 https://github.com/OldRon1977
// @credits       Developer: ecomcodeLab https://github.com/ecomcodeLab
// @match         https://www.kleinanzeigen.de/*
// @match         https://kleinanzeigen.de/*
// @match         https://*.kleinanzeigen.de/*
// @homepage      https://github.com/ecomcodeLab/klein-zeigen-clonebutton-auto
// @updateURL     https://github.com/ecomcodeLab/klein-zeigen-clonebutton-auto/raw/main/kleinanzeigen-backup.user.js
// @downloadURL   https://github.com/ecomcodeLab/klein-zeigen-clonebutton-auto/raw/main/kleinanzeigen-backup.user.js
// @run-at        document-idle
// @grant         GM_getValue
// @grant         GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // STORAGE HELPERS (Fallback auf LocalStorage falls GM fehlt)
  // ============================================================
  function getVal(key, def) {
    try {
      let v = GM_getValue(key);
      return v !== undefined ? v : def;
    } catch (e) {
      let s = localStorage.getItem('ka_' + key);
      return s !== null ? JSON.parse(s) : def;
    }
  }
  function setVal(key, val) {
    try {
      GM_setValue(key, val);
    } catch (e) {
      localStorage.setItem('ka_' + key, JSON.stringify(val));
    }
  }

  // ============================================================
  // CONFIG & SETTINGS
  // ============================================================
  const CONFIG = {
    NOTIFICATION_TIMEOUT_MS: 4000,
    INITIAL_RETRY_WAIT_MS: 1000
  };

  let settings = {
    waitDays: parseInt(getVal('waitDays', 7)),
    adCount: parseInt(getVal('adCount', 3)),
    renewAll: getVal('renewAll', false),
    autoStart: getVal('autoStart', false),
    waitBeforeStart: parseInt(getVal('waitBeforeStart', 10)),
    batchSize: parseInt(getVal('batchSize', 5)),
    batchPauseMin: parseInt(getVal('batchPauseMin', 5))
  };

  function saveSettings() {
    setVal('waitDays', settings.waitDays);
    setVal('adCount', settings.adCount);
    setVal('renewAll', settings.renewAll);
    setVal('autoStart', settings.autoStart);
    setVal('waitBeforeStart', settings.waitBeforeStart);
    setVal('batchSize', settings.batchSize);
    setVal('batchPauseMin', settings.batchPauseMin);
    let nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + settings.waitDays);
    let nextStr = nextDate.toISOString().split('T')[0];
    setVal('nextRunDate', nextStr);
    return nextStr;
  }

  // ============================================================
  // PAGE DETECTION
  // ============================================================
  const isLoginPage = () => /login|register|signup|u\/login/.test(window.location.href);
  const isOverviewPage = () => window.location.href.includes('/m-meine-anzeigen') || (document.querySelector('h1') && document.querySelector('h1').textContent.includes('Meine Anzeigen'));
  const isEditPage = () => window.location.href.includes('/p-anzeige-bearbeiten') || (window.location.href.includes('anzeige-aufgeben') && !window.location.href.includes('bestaetigung'));
  const isSuccessPage = () => /bestaetigung|confirmation|success|geschafft/.test(window.location.href) || (document.body && document.body.innerText.includes('Anzeige geht bald online'));

  // ============================================================
  // UTILS
  // ============================================================
  const delay = ms => new Promise(res => setTimeout(res, ms));

  function waitForElement(selectorFn, timeout = 10000) {
    return new Promise((resolve) => {
      let el = selectorFn();
      if (el) return resolve(el);
      let start = Date.now();
      let timer = setInterval(() => {
        el = selectorFn();
        if (el || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve(el);
        }
      }, 500);
    });
  }

  function getCsrfToken() {
    let meta = document.querySelector('meta[name="_csrf"]');
    if (meta) return meta.getAttribute('content');
    let input = document.querySelector('input[name="_csrf"]');
    if (input) return input.value;
    return null;
  }

  function findSaveButton() {
    let btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    return btns.find(b => {
      let t = b.textContent.trim() || b.value || "";
      return t.includes('Anzeige speichern') || t === 'Speichern';
    });
  }

  // ============================================================
  // API ACTIONS (Löschen)
  // ============================================================
  async function deleteAd(adId) {
    console.log('[KA-Bot] Lösche Original-Anzeige:', adId);
    let token = getCsrfToken();
    if (!token) throw new Error('CSRF Token nicht gefunden');

    let response = await fetch(`https://www.kleinanzeigen.de/m-anzeigen-loeschen.json?ids=${adId}`, {
      method: 'POST',
      headers: {
        'x-csrf-token': token,
        'accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Löschen fehlgeschlagen: ' + response.status);
    return true;
  }

  // ============================================================
  // POPUP CLOSER
  // ============================================================
  function closePromoPopups() {
    let btns = Array.from(document.querySelectorAll('button, a'));
    let closeBtn = btns.find(b => {
      let text = b.textContent.toLowerCase();
      return text.includes('ohne hochschieben') || text.includes('überspringen');
    });

    // Fallback für Standard "X" Close-Buttons bei offenen Modals
    if (!closeBtn && document.querySelector('.modal-open, .m-modal, dialog[open]')) {
      closeBtn = document.querySelector('.mfp-close, .modal-close, button[aria-label="Schließen"], .j-modal-close');
    }

    if (closeBtn) {
      console.log("[KA-Bot] Promo-Popup erkannt und wird geschlossen...");
      closeBtn.click();
    }
  }

  // ============================================================
  // BOT ACTIONS (Copy First, Delete After)
  // ============================================================
  async function duplicateAd() {
    // Nur duplizieren: Markiere KEINE AdId zum Löschen
    setVal('pendingDeleteAdId', null);
    await performDuplicate("Bereite Duplikat vor...");
  }

  async function smartRepublish() {
    let m = window.location.search.match(/adId=(\d+)/);
    if (m) {
      // Original-ID merken, damit sie auf der Erfolgsseite gelöscht werden kann
      setVal('pendingDeleteAdId', m[1]); 
    }
    await performDuplicate("Smart: Erstelle Kopie...");
  }

  async function performDuplicate(spinnerText) {
    showSpinner(true, spinnerText);
    let saveBtn = await waitForElement(findSaveButton);
    if (!saveBtn) {
      showToast("Speichern-Button nicht gefunden", "error");
      showSpinner(false);
      return;
    }
    
    // ID entfernen um Neu-Erstellung als Kopie zu erzwingen
    let idInput = document.querySelector('input[name="adId"], #postad-id');
    if (idInput) {
      idInput.removeAttribute('name');
      idInput.value = '';
    }
    await delay(1000);
    saveBtn.click();

    // Starte aggressives Popup-Monitoring nach Klick auf Speichern
    setInterval(closePromoPopups, 500);
  }

  // ============================================================
  // UI COMPONENTS (Styles, Toast, Spinner)
  // ============================================================
  const STYLES = `
    #ka-panel { position: fixed; bottom: 20px; right: 20px; z-index: 10000; width: 300px; background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 12px; font-family: sans-serif; color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,0.5); overflow: hidden; }
    #ka-ph { background: #16213e; padding: 10px 15px; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2d2d4e; }
    #ka-pb { padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    .ka-row { display: grid; grid-template-columns: 1fr 60px; align-items: center; font-size: 12px; }
    .ka-inp { background: #0f3460; border: 1px solid #2d2d4e; color: #fff; padding: 4px; border-radius: 4px; text-align: center; }
    .ka-btn { padding: 8px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .ka-btn-blue { background: #3a3aaa; color: #fff; }
    .ka-btn-blue:hover { background: #4a4abb; }
    .ka-btn-red { background: #7a2020; color: #fff; }
    .ka-btn-red:hover { background: #922626; }
    .ka-btn-save { background: #1e3a1e; color: #80b080; font-size: 11px; margin-top: 5px; }
    #ka-pill { position: fixed; bottom: 20px; right: 20px; z-index: 10000; background: #1a1a2e; border: 1px solid #2d2d4e; padding: 8px 15px; border-radius: 20px; color: #a0a0c0; cursor: pointer; font-size: 12px; display: none; }
    .ka-banner { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10001; background: #1a1a2e; border: 2px solid #3a3aaa; border-radius: 10px; padding: 20px; text-align: center; color: #fff; min-width: 250px; box-shadow: 0 10px 40px rgba(0,0,0,0.7); }
    .ka-banner h3 { margin: 0 0 10px; color: #a0a0ff; }
    .ka-cd { font-size: 40px; font-weight: bold; margin: 10px 0; }
    .ka-toast { position: fixed; top: 20px; right: 20px; background: #2980b9; color: #fff; padding: 10px 20px; border-radius: 5px; z-index: 11000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    
    /* NON-BLOCKING SPINNER (Bottom Left) */
    .ka-spinner { position: fixed; bottom: 20px; left: 20px; background: #1a1a2e; color: #fff; padding: 10px 15px; border-radius: 8px; border: 1px solid #3a3aaa; z-index: 10500; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-family: sans-serif; font-size: 13px; pointer-events: none; }
    .ka-spinner-circle { width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: ka-spin 1s linear infinite; }
    @keyframes ka-spin { to { transform: rotate(360deg); } }
  `;

  function injectStyles() {
    if (document.getElementById('ka-styles')) return;
    let s = document.createElement('style');
    s.id = 'ka-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function showToast(msg, type = "info") {
    let t = document.createElement('div');
    t.className = 'ka-toast';
    if (type === "error") t.style.background = "#c0392b";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), CONFIG.NOTIFICATION_TIMEOUT_MS);
  }

  function showSpinner(show, text = "Arbeite...") {
    let ex = document.querySelector('.ka-spinner');
    if (ex) ex.remove();
    if (!show) return;
    let s = document.createElement('div');
    s.className = 'ka-spinner';
    s.innerHTML = `<div class="ka-spinner-circle"></div><span>${text}</span>`;
    document.body.appendChild(s);
  }

  // ============================================================
  // COUNTDOWN BANNER (Manuell & Auto)
  // ============================================================
  function startWithCountdown(onComplete, title = "Bot startet") {
    let banner = document.createElement('div');
    banner.className = 'ka-banner';
    banner.innerHTML = `
      <h3>${title}</h3>
      <p>Prozess beginnt in...</p>
      <div class="ka-cd" id="ka-cd-val">10s</div>
      <button class="ka-btn ka-btn-red" id="ka-cancel-cd">Abbrechen</button>
    `;
    document.body.appendChild(banner);

    let count = 10;
    let timer = setInterval(() => {
      count--;
      document.getElementById('ka-cd-val').textContent = count + 's';
      if (count <= 0) {
        clearInterval(timer);
        banner.remove();
        onComplete();
      }
    }, 1000);

    document.getElementById('ka-cancel-cd').onclick = () => {
      clearInterval(timer);
      banner.remove();
      showToast("Vorgang abgebrochen");
    };
  }

  // ============================================================
  // QUEUE ENGINE
  // ============================================================
  let runQueue = [];
  let isRunning = false;

  async function processQueue() {
    if (runQueue.length === 0) {
      isRunning = false;
      setVal('isRunning', false);
      showToast("Alle Anzeigen erfolgreich erneuert!");
      setVal('lastAutostartRun', new Date().toISOString().split('T')[0]);
      setTimeout(() => window.location.href = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html', 2000);
      return;
    }

    let batchSize = parseInt(getVal('batchSize', 5));
    let processed = parseInt(getVal('processedInBatch', 0));

    if (processed >= batchSize) {
      let pause = parseInt(getVal('batchPauseMin', 5));
      showToast(`Batch-Limit erreicht. Pause für ${pause} Minuten...`);
      setVal('processedInBatch', 0);
      await delay(pause * 60 * 1000);
    }

    let nextAd = runQueue.shift();
    setVal('runQueue', JSON.stringify(runQueue));
    setVal('isRunning', true);
    setVal('processedInBatch', processed + 1);

    window.location.href = `https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=${nextAd}#autoRepublish`;
  }

  // ============================================================
  // PANEL & UI LOGIC
  // ============================================================
  function buildPanel() {
    if (document.getElementById('ka-panel')) return;
    injectStyles();

    let panel = document.createElement('div');
    panel.id = 'ka-panel';
    let isMin = getVal('minimized', false);
    panel.style.display = isMin ? 'none' : 'block';

    let pill = document.createElement('div');
    pill.id = 'ka-pill';
    pill.textContent = "KA Bot ▶";
    pill.style.display = isMin ? 'block' : 'none';

    panel.innerHTML = `
      <div id="ka-ph">
        <span style="font-weight:bold; font-size:13px; color:#a0a0ff;">KA BOT</span>
        <button id="ka-min" style="background:none; border:none; color:#fff; cursor:pointer; font-size:20px;">−</button>
      </div>
      <div id="ka-pb">
        <div class="ka-row"><label>Warte (Tage)</label><input type="number" id="ka-in-days" class="ka-inp" value="${settings.waitDays}"></div>
        <div class="ka-row"><label>Anzahl Anzeigen</label><input type="number" id="ka-in-count" class="ka-inp" value="${settings.adCount}"></div>
        <div class="ka-row"><label>Batch-Größe</label><input type="number" id="ka-in-batch" class="ka-inp" value="${settings.batchSize}"></div>
        <div class="ka-row"><label>Pause (Min)</label><input type="number" id="ka-in-pause" class="ka-inp" value="${settings.batchPauseMin}"></div>
        <div class="ka-row" style="grid-template-columns: 1fr 30px;"><label>Auto-Start</label><input type="checkbox" id="ka-in-auto" ${settings.autoStart ? 'checked' : ''}></div>
        <div class="ka-row" style="grid-template-columns: 1fr 30px;"><label>Alle erneuern</label><input type="checkbox" id="ka-in-all" ${settings.renewAll ? 'checked' : ''}></div>
        <hr style="border:0; border-top:1px solid #2d2d4e; margin:5px 0;">
        <div style="font-size:11px; display:flex; justify-content:space-between;"><span>Nächster Run:</span><span id="ka-next-run">${getVal('nextRunDate', '-')}</span></div>
        <button id="ka-start-btn" class="ka-btn ka-btn-blue">▶ Starten</button>
        <button id="ka-save-btn" class="ka-btn ka-btn-save">Einstellungen speichern</button>
      </div>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(pill);

    document.getElementById('ka-min').onclick = () => {
      panel.style.display = 'none';
      pill.style.display = 'block';
      setVal('minimized', true);
    };
    pill.onclick = () => {
      pill.style.display = 'none';
      panel.style.display = 'block';
      setVal('minimized', false);
    };

    document.getElementById('ka-save-btn').onclick = () => {
      settings.waitDays = parseInt(document.getElementById('ka-in-days').value);
      settings.adCount = parseInt(document.getElementById('ka-in-count').value);
      settings.batchSize = parseInt(document.getElementById('ka-in-batch').value);
      settings.batchPauseMin = parseInt(document.getElementById('ka-in-pause').value);
      settings.autoStart = document.getElementById('ka-in-auto').checked;
      settings.renewAll = document.getElementById('ka-in-all').checked;
      let next = saveSettings();
      document.getElementById('ka-next-run').textContent = next;
      showToast("Einstellungen gespeichert!");
    };

    document.getElementById('ka-start-btn').onclick = () => {
      if (!isOverviewPage()) {
        window.location.href = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
        return;
      }
      startWithCountdown(() => {
        let ads = Array.from(document.querySelectorAll('a[href*="adId="]'))
          .map(a => a.href.match(/adId=(\d+)/))
          .filter(m => m)
          .map(m => m[1]);
        
        ads = [...new Set(ads)]; // Deduplizieren
        if (!settings.renewAll) ads = ads.slice(0, settings.adCount);
        
        runQueue = ads;
        setVal('runQueue', JSON.stringify(runQueue));
        setVal('processedInBatch', 0);
        processQueue();
      }, "Manueller Start");
    };
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  async function init() {
    if (isLoginPage()) return;
    injectStyles();

    // 1. Check Hash Actions (SmartNeu / AutoNeu)
    if (window.location.hash === '#autoRepublish' || window.location.hash === '#smartRepublish') {
      await smartRepublish();
      return;
    }

    // 2. Success Page Handler
    if (isSuccessPage()) {
      showSpinner(true, "Anzeige ist online! Räume auf...");
      
      // Starte sofort die Überwachung für Popups auf der Erfolgsseite
      let popupTimer = setInterval(closePromoPopups, 500);

      // Lösche das Original (falls eine ID hinterlegt wurde)
      let pendingDelete = getVal('pendingDeleteAdId', null);
      if (pendingDelete) {
         try {
             await deleteAd(pendingDelete);
         } catch(e) {
             console.warn("Löschen der Originalanzeige fehlgeschlagen", e);
         }
         // ID wieder leeren, damit es nicht nochmal ausgeführt wird
         setVal('pendingDeleteAdId', null);
      }

      // 4 Sekunden stabilisieren lassen, dann zur nächsten Anzeige / Übersicht springen
      setTimeout(async () => {
        clearInterval(popupTimer); // Popup-Beobachter stoppen
        
        let q = JSON.parse(getVal('runQueue', '[]'));
        if (q.length > 0 && getVal('isRunning', false)) {
          processQueue();
        } else {
          setVal('isRunning', false);
          window.location.href = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
        }
      }, 4000);
      return;
    }

    // 3. UI building
    if (isOverviewPage()) {
      buildPanel();
      setTimeout(() => {
        document.querySelectorAll('a[href*="p-anzeige-bearbeiten.html?adId="]').forEach(link => {
          if (link.dataset.kaBtn) return;
          link.dataset.kaBtn = "1";
          let id = link.href.match(/adId=(\d+)/)[1];
          let b = document.createElement('button');
          b.textContent = "Smart neu";
          b.style.cssText = "margin-left:10px; font-size:10px; padding:2px 5px; cursor:pointer; background:#16213e; color:#a0a0ff; border:1px solid #2d2d4e; border-radius:4px;";
          b.onclick = (e) => {
            e.preventDefault();
            window.open(`https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=${id}#smartRepublish`, '_blank');
          };
          link.after(b);
        });
      }, 1500);
    }

    if (isEditPage()) {
      // Toolbar on edit page
      let tb = document.createElement('div');
      tb.style.cssText = "position:fixed; bottom:20px; right:200px; z-index:9999; display:flex; gap:10px;";
      tb.innerHTML = `
        <button id="ka-dup" class="ka-btn ka-btn-blue">Duplizieren</button>
        <button id="ka-smart" class="ka-btn ka-btn-blue" style="background:#2c3e50">Smart Neu</button>
      `;
      document.body.appendChild(tb);
      document.getElementById('ka-dup').onclick = duplicateAd;
      document.getElementById('ka-smart').onclick = smartRepublish;
    }

    // 4. Auto-Start Check
    if (settings.autoStart && !getVal('isRunning', false)) {
      let nextRun = getVal('nextRunDate', '');
      let lastRun = getVal('lastAutostartRun', '');
      let today = new Date().toISOString().split('T')[0];

      if (nextRun && today >= nextRun && lastRun !== today) {
        setTimeout(() => {
          startWithCountdown(() => {
            setVal('lastAutostartRun', today);
            window.location.href = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
          }, "Auto-Start fällig");
        }, 3000);
      }
    }
  }

  init();
})();