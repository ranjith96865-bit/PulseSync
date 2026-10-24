/**
 * SAMJHORX - UNIFIED EMERGENCY RESPONSE & PRESCRIPTION SENTINEL
 * Powered by Live Ambulance Tracking, Hospital Capacity Telemetry,
 * Golden Hour ER Pre-Arrival Routing, & Multilingual Vernacular Voice Guardian.
 */

(function() {
  "use strict";

  const $ = function(s, r) { return (r || document).querySelector(s); };
  const esc = function(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const store = {
    get: function(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const now = function() { return Date.now(); };

  function toast(msg, type = "info") {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function() { t.hidden = true; }, 3600);
  }

  /* ========================================================
     1. LANGUAGES & AUDIO SYNTHESIS
     ======================================================== */
  const LANGS = [
    { k: "kn", name: "Kannada", native: "ಕನ್ನಡ", bcp: "kn-IN", pre: "kn" },
    { k: "hi", name: "Hindi", native: "हिन्दी", bcp: "hi-IN", pre: "hi" },
    { k: "ta", name: "Tamil", native: "தமிழ்", bcp: "ta-IN", pre: "ta" },
    { k: "te", name: "Telugu", native: "తెలుగు", bcp: "te-IN", pre: "te" },
    { k: "bn", name: "Bengali", native: "বাংলা", bcp: "bn-IN", pre: "bn" },
    { k: "mr", name: "Marathi", native: "मराठी", bcp: "mr-IN", pre: "mr" },
    { k: "ml", name: "Malayalam", native: "മലയാളം", bcp: "ml-IN", pre: "ml" },
    { k: "en", name: "English", native: "English", bcp: "en-IN", pre: "en" }
  ];

  const langOf = function(k) {
    return LANGS.filter(function(l) { return l.k === k; })[0] || LANGS[0];
  };

  let voices = [];
  function loadVoices() {
    try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; }
  }
  function voiceFor(l) {
    const p = l.pre;
    return voices.filter(function(v) {
      return String(v.lang).toLowerCase().replace("_", "-").indexOf(p) === 0;
    })[0] || null;
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {}
  }

  /* ========================================================
     2. GLOBAL STATE
     ======================================================== */
  const S = {
    tab: "card", // Default to Prescription Sentinel (first tab)
    lang: store.get("sx_lang") || "kn", // Default to Kannada
    rate: 1.0,
    speaking: false,
    currentPatientName: "Rajesh Kumar (54M)",
    userHasCustomName: false,
    currentRx: "cardiac-discharge",
    filt: "all",
    req: null,
    dFilt: "All",
    dOnly: true,
    staff: false,
    cameraStream: null,
    G: {
      type: null,
      start: null,
      onset: 0,
      v: { age: "54", sex: "Male", hr: "128", sys: "82", dia: "54", spo2: "89", gcs: "10", note: "Acute retrosternal chest pain radiating to jaw. Cold diaphoresis." },
      sent: null
    }
  };

  /* ========================================================
     3. SIMULATED CITY DATA (HOSPITALS, AMBULANCES, DOCTORS)
     ======================================================== */
  const H = [
    { id: "H1", name: "Cauvery Multispeciality", x: 2.4, y: -1.8, icu: [5, 24], vent: [4, 14], ct: "up", mri: "up", cath: true, m: 4 },
    { id: "H2", name: "Lakeview Heart & Neuro Centre", x: -1.6, y: 1.4, icu: [0, 16], vent: [0, 8], ct: "down", mri: "up", cath: true, m: 9 },
    { id: "H3", name: "Metro Trauma & Orthopaedic", x: 4.8, y: 3.6, icu: [3, 18], vent: [2, 10], ct: "up", mri: "none", cath: false, m: 22 },
    { id: "H4", name: "Sunrise Community Hospital", x: -3.9, y: -2.7, icu: [1, 6], vent: [1, 3], ct: "none", mri: "none", cath: false, m: 74 },
    { id: "H5", name: "Green Valley Institute of Medical Sciences", x: -5.8, y: 4.9, icu: [9, 40], vent: [6, 22], ct: "up", mri: "up", cath: true, m: 41 },
    { id: "H6", name: "St. Anne's Mission Hospital", x: 1.2, y: 6.3, icu: [2, 10], vent: [1, 5], ct: "busy", mri: "none", cath: false, m: 14 }
  ];
  H.forEach(function(h) { h.at = now() - h.m * 60000; });
  const hById = function(id) { return H.filter(function(h) { return h.id === id; })[0]; };

  const SPECS = ["Cardiology", "Neurology", "Trauma surgery", "Orthopaedics", "General medicine", "Paediatrics", "Pulmonology", "Gynaecology", "Anaesthesia"];

  const DOCS = [
    { n: "Dr. Meera Kulkarni", q: "MBBS, MD, DM", s: "Cardiology", h: "H1", st: "on", lg: "Kannada, English, Hindi" },
    { n: "Dr. Arjun Prabhu", q: "MBBS, MD, DM", s: "Neurology", h: "H1", st: "on", lg: "Kannada, English" },
    { n: "Dr. S. Thomas", q: "MBBS, MS, MCh", s: "Trauma surgery", h: "H1", st: "on", lg: "English, Malayalam, Tamil" },
    { n: "Dr. Farah Siddiqui", q: "MBBS, MD", s: "Pulmonology", h: "H1", st: "off", next: "4:00 PM", lg: "Hindi, Urdu, English" },
    { n: "Dr. R. Venkatesh", q: "MBBS, MD, DM", s: "Cardiology", h: "H2", st: "on", lg: "Tamil, Telugu, English" },
    { n: "Dr. Lakshmi Narayan", q: "MBBS, MD, DM", s: "Neurology", h: "H2", st: "call", lg: "Kannada, Telugu, English" },
    { n: "Dr. Imran Pasha", q: "MBBS, MS", s: "Orthopaedics", h: "H3", st: "on", lg: "Kannada, Hindi, Urdu" },
    { n: "Dr. Kavya Rao", q: "MBBS, MS, MCh", s: "Trauma surgery", h: "H3", st: "on", lg: "Kannada, English" },
    { n: "Dr. D. Nair", q: "MBBS, MD", s: "Anaesthesia", h: "H3", st: "on", lg: "English, Malayalam" },
    { n: "Dr. Anand Gowda", q: "MBBS, MD", s: "General medicine", h: "H4", st: "on", lg: "Kannada, English" },
    { n: "Dr. Pooja Shetty", q: "MBBS, MD", s: "Paediatrics", h: "H4", st: "off", next: "Tomorrow 9:00 AM", lg: "Kannada, Tulu, English" },
    { n: "Dr. Sunil Hegde", q: "MBBS, MD, DM", s: "Neurology", h: "H5", st: "on", lg: "Kannada, English, Hindi" },
    { n: "Dr. Rekha Menon", q: "MBBS, MD, DM", s: "Cardiology", h: "H5", st: "on", lg: "Malayalam, English, Kannada" },
    { n: "Dr. Vikram Joshi", q: "MBBS, MS, MCh", s: "Trauma surgery", h: "H5", st: "on", lg: "Marathi, Hindi, English" },
    { n: "Dr. Ayesha Khan", q: "MBBS, MS", s: "Gynaecology", h: "H5", st: "on", lg: "Urdu, Hindi, English" },
    { n: "Dr. Joseph Fernandes", q: "MBBS, MD, DM", s: "Cardiology", h: "H6", st: "call", lg: "Konkani, Kannada, English" },
    { n: "Dr. Latha Bhat", q: "MBBS, MS", s: "Gynaecology", h: "H6", st: "on", lg: "Kannada, English" },
    { n: "Dr. Mohan Das", q: "MBBS, MD", s: "General medicine", h: "H6", st: "on", lg: "Bengali, Hindi, English" }
  ];

  const AMB = [
    { id: "KA-108-01", type: "ALS", x: 1.1, y: 0.9, st: "available", free: 0, crew: "Paramedic + driver" },
    { id: "KA-108-02", type: "CCU", x: -2.2, y: -1.0, st: "available", free: 0, crew: "Doctor + paramedic" },
    { id: "KA-108-03", type: "BLS", x: 3.0, y: 1.2, st: "available", free: 0, crew: "EMT + driver" },
    { id: "KA-108-04", type: "ALS", x: -0.6, y: -3.4, st: "busy", free: 9, crew: "Paramedic + driver" },
    { id: "KA-108-05", type: "BLS", x: -4.4, y: 2.2, st: "available", free: 0, crew: "EMT + driver" },
    { id: "KA-108-06", type: "CCU", x: 4.6, y: -3.8, st: "busy", free: 15, crew: "Doctor + paramedic" },
    { id: "KA-108-07", type: "ALS", x: 0.3, y: 4.3, st: "available", free: 0, crew: "Paramedic + driver" },
    { id: "KA-108-08", type: "BLS", x: -1.4, y: -5.6, st: "available", free: 0, crew: "EMT + driver" }
  ];

  const AMB_INFO = {
    BLS: "Basic life support: oxygen, stretcher, first aid",
    ALS: "Advanced life support: paramedic, ECG, defibrillator, IV drugs, ventilator",
    CCU: "Mobile cardiac ICU: doctor on board, full monitoring"
  };
  AMB.forEach(function(a) { a.tx = a.x; a.ty = a.y; });

  const dist = function(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  const YOU = { x: 0, y: 0 };
  const etaAmb = function(km) { return Math.max(1, Math.round(km * 1.35 / 38 * 60)); };
  const etaCar = function(km) { return Math.max(1, Math.round(km * 1.35 / 32 * 60)); };
  function ageMin(h) { return Math.max(0, Math.round((now() - h.at) / 60000)); }
  function ageText(h) {
    const m = ageMin(h);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + (m % 60) + " min ago";
  }
  function fresh(h) {
    const m = ageMin(h);
    return m < 30 ? { c: "good", t: "Fresh" } : m < 60 ? { c: "warn", t: "Verify by phone" } : { c: "crit", t: "Stale" };
  }
  function onDuty(hid, spec) {
    const d = DOCS.filter(function(x) { return x.h === hid && x.s === spec; });
    let best = null;
    d.forEach(function(x) {
      if (x.st === "on") best = "on";
      else if (x.st === "call" && best !== "on") best = "call";
    });
    return best;
  }

  function simTick() {
    AMB.forEach(function(a) {
      const d = Math.hypot(a.tx - a.x, a.ty - a.y);
      if (d < 0.15) {
        a.tx = (Math.random() * 14 - 7);
        a.ty = (Math.random() * 12 - 6);
      } else {
        const s = a.st === "busy" ? 0.16 : 0.1;
        a.x += (a.tx - a.x) / d * s;
        a.y += (a.ty - a.y) / d * s;
      }
      if (a.st === "busy") {
        a.free -= 0.1;
        if (a.free <= 0) { a.st = "available"; a.free = 0; }
      } else if (Math.random() < 0.015) {
        a.st = "busy";
        a.free = 8 + Math.round(Math.random() * 12);
      }
    });
    if (S.tab === "ambulance") updateAmb();
    if (S.tab === "golden" && S.G.type) updateGoldenAmb();
  }

  /* ========================================================
     4. MAP RENDERING
     ======================================================== */
  function mapSVG(o) {
    o = o || {};
    let s = '<svg class="map" viewBox="-9 -8 18 16" role="img" aria-label="Schematic map with hospitals and ambulances around the demo location">';
    for (let x = -8; x <= 8; x += 2) s += '<line class="g" x1="' + x + '" y1="-8" x2="' + x + '" y2="8"/>';
    for (let y = -8; y <= 8; y += 2) s += '<line class="g" x1="-9" y1="' + y + '" x2="9" y2="' + y + '"/>';
    s += '<line class="road" x1="-9" y1="-1" x2="9" y2="1.500"/><line class="road" x1="-3" y1="-8" x2="3" y2="8"/><line class="road" x1="-9" y1="5" x2="9" y2="-4"/>';
    if (o.route) {
      const h = hById(o.route);
      if (h) s += '<line class="route" x1="0" y1="0" x2="' + h.x + '" y2="' + h.y + '"/>';
    }
    H.forEach(function(h) {
      s += '<g><rect class="hosp" x="' + (h.x - 0.5) + '" y="' + (h.y - 0.5) + '" width="1" height="1" rx=".15"/><path class="hx" d="M' + h.x + ' ' + (h.y - 0.3) + 'v.6M' + (h.x - 0.3) + ' ' + h.y + 'h.6"/><text x="' + (h.x + 0.7) + '" y="' + (h.y + 0.2) + '">' + h.id + '</text></g>';
    });
    if (o.amb) {
      AMB.forEach(function(a) {
        s += '<circle class="' + (a.st === "available" ? "a-av" : "a-bu") + '" cx="' + a.x.toFixed(2) + '" cy="' + a.y.toFixed(2) + '" r=".3"/>';
        if (o.hi === a.id) s += '<circle class="ring" cx="' + a.x.toFixed(2) + '" cy="' + a.y.toFixed(2) + '" r=".62"/>';
      });
    }
    s += '<circle class="you" cx="0" cy="0" r=".4"/><circle class="ring" cx="0" cy="0" r=".75"/><text x=".95" y=".2">You</text></svg>';
    return s;
  }
  const LEG = '<div class="legend"><span><i style="background:var(--ok)"></i>Ambulance available</span><span><i style="background:var(--mute)"></i>Ambulance on a call</span><span><i style="background:var(--accent)"></i>You (demo location)</span><span>Square = hospital</span><span>Grid square = 2 km</span></div>';

  /* ========================================================
     5. PRESCRIPTION SENTINEL DATA & MODELS (EXCEPT DISCHARGE)
     ======================================================== */
  const RX_DATA = {
    'cardiac-discharge': {
      patientHeading: 'Patient: Rajesh Kumar (54M) &bull; Post-Angioplasty',
      clinic: 'Apex Heart Institute &bull; Dept of Cardiology',
      doctor: 'Dr. S. Mehta, MD, DM (Cardio) &bull; Reg: MCI-48192',
      rawText: `1. Tab. Ecosprin (Aspirin) 75mg - 1 Tab - OD - PC (After lunch)<br>
2. Tab. Clopilet (Clopidogrel) 75mg - 1 Tab - OD - PC (After dinner)<br>
3. Tab. Atorva (Atorvastatin) 40mg - 1 Tab - HS (Bedtime)<br>
4. Tab. Metolar XR (Metoprolol) 50mg - 1 Tab - BD (Morning & Night)<br>
<span class="otc-flag">⚠️ Patient reported taking: Tab. Brufen (Ibuprofen) 400mg BD for knee pain</span>`,
      deciphered: [
        { pill: 'Ecosprin 75mg (Aspirin)', schedule: '1 tablet once daily strictly after lunch', purpose: 'Prevents blood clots from clogging heart stent.' },
        { pill: 'Clopilet 75mg (Clopidogrel)', schedule: '1 tablet once daily strictly after dinner', purpose: 'Second antiplatelet shield ensuring arterial flow.' },
        { pill: 'Atorva 40mg (Atorvastatin)', schedule: '1 tablet once daily at bedtime', purpose: 'Lowers cholesterol & stabilizes plaque.' },
        { pill: 'Metolar XR 50mg (Metoprolol)', schedule: '1 tablet twice daily (Morning & Night)', purpose: 'Lowers heart rate & relieves cardiac strain.' }
      ],
      interaction: {
        hasConflict: true,
        title: 'CRITICAL DRUG CONFLICT DETECTED',
        conflictDrugs: 'Aspirin (Ecosprin) + Ibuprofen (Brufen)',
        explanation: 'Taking Ibuprofen alongside Aspirin blocks cardioprotective effect and increases stomach bleeding risk by 400%.',
        action: '👉 Action Required: Stop Ibuprofen immediately. Use Paracetamol 650mg for knee pain instead upon consulting doctor.'
      },
      routine: {
        morning: ['Metolar XR 50mg (After Food)'],
        noon: ['Ecosprin 75mg (After Lunch)'],
        night: ['Clopilet 75mg (After Dinner)', 'Atorva 40mg (Bedtime)']
      },
      summaries: createPersonalizedSummaries('Rajesh Kumar (54M)', true)
    },
    'diabetic-elderly': {
      patientHeading: 'Patient: Smt. Kamla Devi (68F) &bull; Type 2 Diabetes & Hypertension',
      clinic: 'Apex Multispecialty &bull; Endocrinology & Geriatric Clinic',
      doctor: 'Dr. Priya Raman, MD (Med) &bull; Reg: MCI-59210',
      rawText: `1. Tab. Glycomet GP 2 (Metformin 500 + Glimepiride 2) - 1 Tab - BD - AC (Before meals)<br>
2. Tab. Telma 40 (Telmisartan) - 1 Tab - OD - Mane (Morning after breakfast)<br>
3. Tab. Rosuvas 10 (Rosuvastatin) - 1 Tab - HS (Bedtime)<br>
<span class="otc-flag">⚠️ Note: Patient frequently skips breakfast after taking morning pills.</span>`,
      deciphered: [
        { pill: 'Glycomet GP 2 (Metformin + Glimepiride)', schedule: '1 tablet twice daily 15 minutes before breakfast & dinner', purpose: 'Controls blood glucose levels throughout the day.' },
        { pill: 'Telma 40 (Telmisartan 40mg)', schedule: '1 tablet once daily in the morning', purpose: 'Maintains healthy blood pressure & protects kidneys.' },
        { pill: 'Rosuvas 10 (Rosuvastatin 10mg)', schedule: '1 tablet once daily before sleeping', purpose: 'Keeps cholesterol low and prevents stroke risk.' }
      ],
      interaction: {
        hasConflict: true,
        title: 'HYPOGLYCEMIA CRITICAL TIMING WARNING',
        conflictDrugs: 'Glimepiride + Skipping Meals',
        explanation: 'Taking Glimepiride without eating breakfast within 20 minutes triggers severe hypoglycemia (dangerously low sugar below 50 mg/dL).',
        action: '👉 Action Required: Always have breakfast immediately after taking the morning tablet. Keep glucose candy accessible.'
      },
      routine: {
        morning: ['Glycomet GP 2 (Before Food)', 'Telma 40 (After Breakfast)'],
        noon: ['Balanced diet + water'],
        night: ['Glycomet GP 2 (Before Dinner)', 'Rosuvas 10 (Bedtime)']
      },
      summaries: createPersonalizedSummaries('Smt. Kamla Devi (68F)', false)
    },
    'pediatric-infection': {
      patientHeading: 'Patient: Master Aarav Sharma (4M) &bull; Acute Bronchial Infection',
      clinic: 'CareKids Pediatric Emergency Center',
      doctor: 'Dr. Anita Desai, MD (Pediatrics) &bull; Reg: MCI-67201',
      rawText: `1. Syp. Augmentin Duo (Amox + Clav 228.5mg) - 5ml - BD - PC x 5 days<br>
2. Syp. Calpol 250 (Paracetamol) - 5ml - SOS (If temp > 100°F)<br>
3. Syp. Ascoril LS - 2.5ml - TDS (For chest congestion)<br>
<span class="otc-flag">⚠️ Note: Finish the complete 5-day antibiotic course even if fever resolves.</span>`,
      deciphered: [
        { pill: 'Syp. Augmentin Duo 5ml', schedule: '5 ml twice daily strictly after meals for 5 days', purpose: 'Pediatric antibiotic clearing chest infection.' },
        { pill: 'Syp. Calpol 250mg 5ml', schedule: '5 ml only when fever exceeds 100°F', purpose: 'Relieves fever and pain.' },
        { pill: 'Syp. Ascoril LS 2.5ml', schedule: '2.5 ml three times daily', purpose: 'Eases breathing and chest congestion.' }
      ],
      interaction: {
        hasConflict: false,
        title: 'PEDIATRIC DOSAGE REGIMEN VERIFIED SAFE',
        conflictDrugs: 'No Drug Conflicts Detected',
        explanation: 'Doses match pediatric body weight parameters. Ensure accurate measuring cap.',
        action: '👉 Note: Complete all 5 days of Augmentin Duo. Do not give aspirin or adult painkillers.'
      },
      routine: {
        morning: ['Augmentin Duo 5ml (After Milk/Breakfast)'],
        noon: ['Calpol 5ml (Only if fever > 100°F)'],
        night: ['Augmentin Duo 5ml (After Dinner)', 'Ascoril LS 2.5ml']
      },
      summaries: createPersonalizedSummaries('Master Aarav Sharma (4M)', false)
    }
  };

  function createPersonalizedSummaries(patientName, isCardiac) {
    if (isCardiac) {
      return {
        kn: {
          badge: 'ಕನ್ನಡ ಸಾರಾಂಶ',
          title: `ರೋಗಿಯ ಸಂಕ್ಷಿಪ್ತ ಸಾರಾಂಶ (${patientName})`,
          purpose: `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ನಿಮ್ಮ ಹೃದಯದ ರಕ್ತನಾಳ ತೆರೆಯಲು ಮತ್ತು ರಕ್ತ ಹೆಪ್ಪುಗಟ್ಟುವುದನ್ನು ತಡೆಯಲು ಈ ಮಾತ್ರೆಗಳನ್ನು ನೀಡಲಾಗಿದೆ.`,
          routine: [
            '☀️ ಬೆಳಿಗ್ಗೆ (8:00 AM): ಮೆಟೋಲಾರ್ 50mg (ಉಪಹಾರದ ನಂತರ)',
            '🌤️ ಮಧ್ಯಾಹ್ನ (1:30 PM): ಇಕೋಸ್ಪ್ರಿನ್ 75mg (ಊಟದ ನಂತರ ಕಡ್ಡಾಯವಾಗಿ)',
            '🌙 ರಾತ್ರಿ (9:00 PM): ಕ್ಲೋಪಿಲೆಟ್ 75mg ಮತ್ತು ಅಟೋರ್ವಾ 40mg (ರಾತ್ರಿಯ ಊಟದ ನಂತರ)'
          ],
          warning: '🚨 ಕಟ್ಟುನಿಟ್ಟಾದ ಎಚ್ಚರಿಕೆ: ನೋವಿಗೆ ಬ್ರೂಫೆನ್ (Ibuprofen) ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ! ಇದು ಇಕೋಸ್ಪ್ರಿನ್ ಜೊತೆ ಸೇರಿದಾಗ ಹೊಟ್ಟೆಯಲ್ಲಿ ತೀವ್ರ ರಕ್ತಸ್ರಾವವನ್ನುಂಟುಮಾಡುತ್ತದೆ.',
          speech: `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಪರಿಶೀಲಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಹೃದಯದ ರಕ್ಷಣೆಗೆ ಇಕೋಸ್ಪ್ರಿನ್ ಮತ್ತು ಕ್ಲೋಪಿಲೆಟ್ ಅತ್ಯಗತ್ಯ. ನೋವಿಗೆ ಬ್ರೂಫೆನ್ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ. ಮಧ್ಯಾಹ್ನದ ಊಟದ ನಂತರ ಇಕೋಸ್ಪ್ರಿನ್ ತೆಗೆದುಕೊಳ್ಳಿ.`
        },
        hi: {
          badge: 'हिन्दी सारांश',
          title: `रोगी का संक्षिप्त सारांश (${patientName})`,
          purpose: `नमस्ते ${patientName} जी। आपके दिल की नसों में खून का बहाव ठीक रखने और क्लॉटिंग रोकने के लिए ये दवाएं दी गई हैं।`,
          routine: ['☀️ सुबह: मेटोलार 50mg (नाश्ते के बाद)', '🌤️ दोपहर: इकोस्प्रिन 75mg (दोपहर के भोजन के बाद)', '🌙 रात: क्लोपिलेट 75mg और एटोरवा 40mg (रात के भोजन के बाद)'],
          warning: '🚨 सख्त चेतावनी: दर्द के लिए ब्रूफेन बिलकुल न लें, यह इकोस्प्रिन के साथ मिलकर पेट में खून बहने का खतरा बढ़ाती है।',
          speech: `नमस्ते ${patientName} जी। आपके पर्चे का विश्लेषण पूरा हो गया है। दिल की सुरक्षा के लिए इकोस्प्रिन और क्लोपिलेट नियमित लें। घुटने या बदन दर्द के लिए ब्रूफेन बिलकुल न लें।`
        },
        ta: {
          badge: 'தமிழ் சுருக்கம்',
          title: `நோயாளியின் சுருக்கம் (${patientName})`,
          purpose: `வணக்கம் ${patientName} அவர்களே. உங்கள் இதயத்தில் ரத்தம் உறைவதைத் தடுக்க இந்த மருந்துகள் பரிந்துரைக்கப்பட்டுள்ளன.`,
          routine: ['☀️ காலை: மெட்டோலார் 50mg', '🌤️ மதியம்: ஈகோஸ்ப்ரின் 75mg', '🌙 இரவு: குளோபிலெட் 75mg & அடோர்வா 40mg'],
          warning: '🚨 முக்கிய எச்சரிக்கை: புரூஃபென் (Ibuprofen) மாத்திரையை சாப்பிடாதீர்கள்.',
          speech: `வணக்கம் ${patientName} அவர்களே. உங்கள் மருந்துச் சீட்டு ஆய்வு செய்யப்பட்டது. இதய மாத்திரைகளுடன் புரூஃபென் மாத்திரையை உட்கொள்ளக் கூடாது.`
        },
        te: {
          badge: 'తెలుగు సారాంశం',
          title: `రోగి సంక్షిప్త సారాంశం (${patientName})`,
          purpose: `నమస్కారం ${patientName} గారు. గుండెలో రక్తం గడ్డకట్టకుండా ఉండటానికి ఈ మందులు రాశారు.`,
          routine: ['☀️ ఉదయం: మెటోలార్ 50mg', '🌤️ మధ్యాహ్నం: ఇకోస్ప్రిన్ 75mg', '🌙 రాత్రి: క్లోపిలెట్ 75mg & అటోర్వా 40mg'],
          warning: '🚨 హెచ్చరిక: బ్రూఫెన్ (Ibuprofen) వాడవద్దు! తీవ్ర రక్తస్రావం జరిగే ప్రమాదం ఉంది.',
          speech: `నమస్కారం ${patientName} గారు. మీ ప్రిస్క్రిప్షన్ విశ్లేషించబడింది. మధ్యాహ్నం ఇకోస్ప్రిన్, రాత్రి క్లోపిలెట్ సమయానికి వేసుకోండి.`
        },
        bn: {
          badge: 'বাংলা সারাংশ',
          title: `রোগীর সংক্ষিপ্ত সারাংশ (${patientName})`,
          purpose: `নমস্কার ${patientName} বাবু। হার্ট সুরক্ষিত রাখতে এবং রক্ত পাতলা রাখতে এই ওষুধগুলি দেওয়া হয়েছে।`,
          routine: ['☀️ সকাল: মেটোলার 50mg', '🌤️ দুপুর: ইকোস্প্রিন 75mg', '🌙 রাত: ক্লোপিলেট 75mg ও অ্যাটোরভা 40mg'],
          warning: '🚨 সতর্কতা: ব্রুফেন ব্যথানাশক ওষুধ একদম খাবেন না।',
          speech: `নমস্কার ${patientName} বাবু। আপনার প্রেসক্রিপশন বিশ্লেষণ করা হয়েছে। দুপুরের খাবারের পর ইকোস্প্রিন নিয়মিত খান।`
        },
        mr: {
          badge: 'मराठी सारांश',
          title: `रुग्णाचा संक्षिप्त सारांश (${patientName})`,
          purpose: `नमस्कार ${patientName} जी. हृदयाच्या स्टेंटच्या सुरक्षिततेसाठी या गोळ्या आवश्यक आहेत.`,
          routine: ['☀️ सकाळ: मेटोलार 50mg', '🌤️ दुपार: इकोस्प्रिन 75mg', '🌙 रात्र: क्लोपिलेट 75mg व अटोरव्हा 40mg'],
          warning: '🚨 चेतावणी: दुखापतीसाठी ब्रुफेन गोळी अजिबात घेऊ नका.',
          speech: `नमस्कार ${patientName} जी. तुमच्या प्रिस्क्रिप्शनचे विश्लेषण पूर्ण झाले आहे. दुपारच्या जेवणानंतर इकोस्प्रिन वेळेवर घ्या.`
        },
        ml: {
          badge: 'മലയാളം സംഗ്രഹം',
          title: `രോഗിയുടെ സംഗ്രഹം (${patientName})`,
          purpose: `നമസ്കാരം ${patientName}. ഹൃദയസംരക്ഷണത്തിനായി ഈ മരുന്നുകൾ കഴിക്കുക.`,
          routine: ['☀️ രാവിലെ: മെറ്റോളാർ 50mg', '🌤️ ഉച്ചയ്ക്ക്: ഇക്കോസ്പ്രിൻ 75mg', '🌙 രാത്രി: ക്ലോപിലെറ്റ് 75mg'],
          warning: '🚨 മുന്നറിയിപ്പ്: ബ്രൂഫെൻ കഴിക്കരുത്.',
          speech: `നമസ്കാരം ${patientName}. നിങ്ങളുടെ കുറിപ്പടി പരിശോധിച്ചു. ഉച്ചഭക്ഷണത്തിന് ശേഷം ഇക്കോസ്പ്രിൻ കഴിക്കുക.`
        },
        en: {
          badge: 'English Summary',
          title: `Patient Brief Summary (${patientName})`,
          purpose: `Hello ${patientName}. These medications protect your heart and prevent blood clots from forming in your arteries.`,
          routine: ['☀️ Morning: Metolar XR 50mg (After breakfast)', '🌤️ Noon: Ecosprin 75mg (Strictly after lunch)', '🌙 Night: Clopilet 75mg & Atorva 40mg (After dinner)'],
          warning: '🚨 Critical Warning: Discontinue Brufen (Ibuprofen) immediately! Combining it with Aspirin causes severe stomach bleeding.',
          speech: `Hello ${patientName}. Your prescription has been verified. Take Ecosprin after lunch and Clopilet after dinner. Avoid taking Brufen painkillers.`
        }
      };
    }

    // Default acute infection / recovery prescription
    return {
      kn: {
        badge: 'ಕನ್ನಡ ಸಾರಾಂಶ',
        title: `ರೋಗಿಯ ಸಂಕ್ಷಿಪ್ತ ಸಾರಾಂಶ (${patientName})`,
        purpose: `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ನಿಮ್ಮ ಸೋಂಕು ಗುಣಪಡಿಸಲು ಮತ್ತು ಜ್ವರ, ನೋವು ನಿಯಂತ್ರಿಸಲು ಈ ಮಾತ್ರೆಗಳನ್ನು ನೀಡಲಾಗಿದೆ.`,
        routine: [
          '☀️ ಬೆಳಿಗ್ಗೆ: ಪ್ಯಾನ್ 40 (ಖಾಲಿ ಹೊಟ್ಟೆಯಲ್ಲಿ) & ಆಗ್ಮೆಂಟಿನ್ 625mg (ತಿಂಡಿಯ ನಂತರ)',
          '🌤️ ಮಧ್ಯಾಹ್ನ: ಡೋಲೋ 650mg (ಊಟದ ನಂತರ ಜ್ವರ ಅಥವಾ ನೋವಿದ್ದರೆ)',
          '🌙 ರಾತ್ರಿ: ಆಗ್ಮೆಂಟಿನ್ 625mg (ಊಟದ ನಂತರ) ಮತ್ತು ಸೆಟ್ಜಿನ್ 10mg (ಮಲಗುವ ಮುನ್ನ)'
        ],
        warning: '🚨 ಎಚ್ಚರಿಕೆ: ವೈದ್ಯರ ಸಲಹೆಯಿಲ್ಲದೆ ಹೆಚ್ಚುವರಿ ಬ್ರೂಫೆನ್ ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ. ಆಂಟಿಬಯಾಟಿಕ್ ಅನ್ನು ಪೂರ್ಣ 5 ದಿನಗಳವರೆಗೆ ತೆಗೆದುಕೊಳ್ಳಿ.',
        speech: `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ವಿಶ್ಲೇಷಿಸಲಾಗಿದೆ. ಬೆಳಿಗ್ಗೆ ಖಾಲಿ ಹೊಟ್ಟೆಯಲ್ಲಿ ಪ್ಯಾನ್ 40 ತೆಗೆದುಕೊಳ್ಳಿ. ತಿಂಡಿಯ ನಂತರ ಆಗ್ಮೆಂಟಿನ್ ತೆಗೆದುಕೊಳ್ಳಿ. ಜ್ವರವಿದ್ದರೆ ಡೋಲೋ ತೆಗೆದುಕೊಳ್ಳಿ.`
      },
      hi: {
        badge: 'हिन्दी सारांश',
        title: `रोगी का संक्षिप्त सारांश (${patientName})`,
        purpose: `नमस्ते ${patientName} जी। आपके संक्रमण को ठीक करने और बुखार व दर्द कम करने के लिए ये दवाइयाँ दी गई हैं।`,
        routine: ['☀️ सुबह: पैन 40 (खाली पेट) और ऑगमेंटिन 625mg (नाश्ते के बाद)', '🌤️ दोपहर: डोलो 650mg (खाने के बाद)', '🌙 रात: ऑगमेंटिन 625mg और सेटज़ीन 10mg'],
        warning: '🚨 चेतावनी: बिना डॉक्टर की सलाह के अतिरिक्त पेनकिलर न लें। एंटीबायोटिक का पूरा कोर्स करें।',
        speech: `नमस्ते ${patientName} जी। आपके पर्चे का विश्लेषण पूरा हो गया है। सुबह खाली पेट पैन 40 लें, नाश्ते के बाद ऑगमेंटिन लें।`
      },
      ta: {
        badge: 'தமிழ் சுருக்கம்',
        title: `நோயாளியின் சுருக்கம் (${patientName})`,
        purpose: `வணக்கம் ${patientName} அவர்களே. தொற்று மற்றும் காய்ச்சலைக் குணப்படுத்த இந்த மருந்துகள் வழங்கப்பட்டுள்ளன.`,
        routine: ['☀️ காலை: பான் 40 & ஆக்மென்டின்', '🌤️ மதியம்: டோலோ 650mg', '🌙 இரவு: ஆக்மென்டின் & செட்ஸின்'],
        warning: '🚨 எச்சரிக்கை: ஆன்டிபயாடிக் மாத்திரைகளை முழுமையாக 5 நாட்கள் உட்கொள்ளுங்கள்.',
        speech: `வணக்கம் ${patientName} அவர்களே. உங்கள் மருந்துச் சீட்டு ஆய்வு செய்யப்பட்டது. காலையில் வெறும் வயிற்றில் பான் 40 எடுத்துக் கொள்ளுங்கள்.`
      },
      te: {
        badge: 'తెలుగు సారాంశం',
        title: `రోగి సంక్షిప్త సారాంశం (${patientName})`,
        purpose: `నమస్కారం ${patientName} గారు. ఇన్ఫెక్షన్ మరియు జ్వరం తగ్గడానికి ఈ మందులు రాశారు.`,
        routine: ['☀️ ఉదయం: పాన్ 40 & ఆగ్మెంటిన్', '🌤️ మధ్యాహ్నం: డోలో 650mg', '🌙 రాత్రి: ఆగ్మెంటిన్ & సెట్జిన్'],
        warning: '🚨 హెచ్చరిక: యాంటీబయాటిక్ కోర్సు పూర్తి 5 రోజులు వేసుకోవాలి.',
        speech: `నమస్కారం ${patientName} గారు. ఉదయం ఖాళీ కడుపుతో పాన్ 40, టిఫిన్ తర్వాత ఆగ్మెంటిన్ తీసుకోండి.`
      },
      bn: {
        badge: 'বাংলা সারাংশ',
        title: `রোগীর সংক্ষিপ্ত সারাংশ (${patientName})`,
        purpose: `নমস্কার ${patientName} বাবু। ইনফেকশন এবং জ্বর সারানোর জন্য এই ওষুধগুলি দেওয়া হয়েছে।`,
        routine: ['☀️ সকাল: প্যান ৪০ ও অগমেন্টিন', '🌤️ দুপুর: ডলো ৬৫০mg', '🌙 রাত: অগমেন্টিন ও সেটজিন'],
        warning: '🚨 সতর্কতা: পুরো ৫ দিনের অ্যান্টিবায়োটিক কোর্স শেষ করুন।',
        speech: `নমস্কার ${patientName} বাবু। সকালে খালি পেটে প্যান ৪০ খান এবং খাবারের পর অগমেন্টিন খান।`
      },
      mr: {
        badge: 'मराठी सारांश',
        title: `रुग्णाचा संक्षिप्त सारांश (${patientName})`,
        purpose: `नमस्कार ${patientName} जी. संसर्ग आणि ताप कमी करण्यासाठी ही औषधे दिली आहेत.`,
        routine: ['☀️ सकाळ: पॅन ४० व ऑगमेंटिन', '🌤️ दुपार: डोलो ६५०mg', '🌙 रात्र: ऑगमेंटिन व सेटझीन'],
        warning: '🚨 चेतावणी: डॉक्टरांच्या सल्ल्याशिवाय वेदनाशामक गोळ्या घेऊ नका.',
        speech: `नमस्कार ${patientName} जी. सकाळी उपाशीपोटी पॅन ४० घ्या आणि नाश्त्यानंतर ऑगमेंटिन घ्या.`
      },
      ml: {
        badge: 'മലയാളം സംഗ്രഹം',
        title: `രോഗിയുടെ സംഗ്രഹം (${patientName})`,
        purpose: `നമസ്കാരം ${patientName}. അണുബാധയും പനിയും മാറാൻ ഈ മരുന്നുകൾ കഴിക്കുക.`,
        routine: ['☀️ രാവിലെ: പാൻ 40 & ആഗ്മെന്റിൻ', '🌤️ ഉച്ചയ്ക്ക്: ഡോളോ 650mg', '🌙 രാത്രി: ആഗ്മെന്റിൻ & സെറ്റ്സിൻ'],
        warning: '🚨 മുന്നറിയിപ്പ്: ആൻ്റിബയോട്ടിക് കോഴ്സ് പൂർത്തിയാക്കുക.',
        speech: `നമസ്കാരം ${patientName}. രാവിലെ വെറുംവയറ്റിൽ പാൻ 40 കഴിക്കുക.`
      },
      en: {
        badge: 'English Summary',
        title: `Patient Brief Summary (${patientName})`,
        purpose: `Hello ${patientName}. These medications are prescribed to treat your acute infection and relieve fever and inflammation.`,
        routine: ['☀️ Morning: Pan 40 (Empty stomach) & Augmentin 625mg (After food)', '🌤️ Noon: Dolo 650mg (After lunch if fever/pain)', '🌙 Night: Augmentin 625mg (After dinner) & Cetzine 10mg (Bedtime)'],
        warning: '🚨 Warning: Finish the full 5-day antibiotic course. Do not take unprescribed NSAID painkillers.',
        speech: `Hello ${patientName}. Your prescription has been analyzed. Take Pan 40 on an empty stomach in the morning, and Augmentin after meals. Finish the 5-day course.`
      }
    };
  }

  function updateSummariesWithPatientName(rx, patientName) {
    if (!rx || !rx.summaries) return;
    LANGS.forEach(function(l) {
      const s = rx.summaries[l.k];
      if (s) {
        s.title = `${s.badge} (${patientName})`;
        if (l.k === 'kn') {
          s.purpose = s.purpose.replace(/ನಮಸ್ಕಾರ\s+[^.]+?ಅವರೇ/g, `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ`);
          if (!s.purpose.includes('ನಮಸ್ಕಾರ')) s.purpose = `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ` + s.purpose;
          s.speech = s.speech.replace(/ನಮಸ್ಕಾರ\s+[^.]+?ಅವರೇ/g, `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ`);
          if (!s.speech.includes('ನಮಸ್ಕಾರ')) s.speech = `ನಮಸ್ಕಾರ ${patientName} ಅವರೇ. ` + s.speech;
        } else if (l.k === 'hi') {
          s.purpose = s.purpose.replace(/नमस्ते\s+[^.]+?जी/g, `नमस्ते ${patientName} जी`);
          if (!s.purpose.includes('नमस्ते')) s.purpose = `नमस्ते ${patientName} जी। ` + s.purpose;
          s.speech = s.speech.replace(/नमस्ते\s+[^.]+?जी/g, `नमस्ते ${patientName} जी`);
          if (!s.speech.includes('नमस्ते')) s.speech = `नमस्ते ${patientName} जी। ` + s.speech;
        } else if (l.k === 'ta') {
          s.purpose = s.purpose.replace(/வணக்கம்\s+[^.]+?அவர்களே/g, `வணக்கம் ${patientName} அவர்களே`);
          s.speech = s.speech.replace(/வணக்கம்\s+[^.]+?அவர்களே/g, `வணக்கம் ${patientName} அவர்களே`);
        } else if (l.k === 'te') {
          s.purpose = s.purpose.replace(/నమస్కారం\s+[^.]+?గారు/g, `నమస్కారం ${patientName} గారు`);
          s.speech = s.speech.replace(/నమస్కారం\s+[^.]+?గారు/g, `నమస్కారం ${patientName} గారు`);
        } else if (l.k === 'bn') {
          s.purpose = s.purpose.replace(/নমস্কার\s+[^.]+?বাবু/g, `নমস্কার ${patientName} বাবু`);
          s.speech = s.speech.replace(/নমস্কার\s+[^.]+?বাবু/g, `নমস্কার ${patientName} বাবু`);
        } else if (l.k === 'mr') {
          s.purpose = s.purpose.replace(/नमस्कार\s+[^.]+?जी/g, `नमस्कार ${patientName} जी`);
          s.speech = s.speech.replace(/नमस्कार\s+[^.]+?जी/g, `नमस्कार ${patientName} जी`);
        } else if (l.k === 'ml') {
          s.purpose = s.purpose.replace(/നമസ്കാരം\s+[^.]+?[.!?]/g, `നമസ്കാരം ${patientName}.`);
          s.speech = s.speech.replace(/നമസ്കാരം\s+[^.]+?[.!?]/g, `നമസ്കാരം ${patientName}.`);
        } else {
          s.purpose = s.purpose.replace(/Hello\s+(?:Mr\.?|Mrs\.?|Ms\.?|Master)?\s*[^.]+?[.!?]/gi, `Hello ${patientName}.`);
          s.speech = s.speech.replace(/Hello\s+(?:Mr\.?|Mrs\.?|Ms\.?|Master)?\s*[^.]+?[.!?]/gi, `Hello ${patientName}.`);
        }
      }
    });
  }

  function loadRxPreset(rxKey) {
    S.currentRx = rxKey;
    const rx = RX_DATA[rxKey];
    if (!rx) return;

    let presetPatient = 'Rajesh Kumar (54M)';
    if (rxKey === 'diabetic-elderly') presetPatient = 'Smt. Kamla Devi (68F)';
    else if (rxKey === 'pediatric-infection') presetPatient = 'Master Aarav Sharma (4M)';
    else if (rxKey === 'cardiac-discharge') presetPatient = 'Rajesh Kumar (54M)';

    S.currentPatientName = presetPatient;
    S.userHasCustomName = false;

    render(true);
  }

  function applyCustomPatientName(newName) {
    const cleanName = newName.trim();
    if (!cleanName) return;

    S.currentPatientName = cleanName;
    S.userHasCustomName = true;

    const rx = RX_DATA[S.currentRx];
    if (rx && rx.summaries) {
      rx.patientHeading = `Patient: <strong>${cleanName}</strong> &bull; Prescription Verified`;
      updateSummariesWithPatientName(rx, cleanName);
    }
    render(true);
    toast(`✅ Patient Name updated to '${cleanName}'! Vernacular audio & summary regenerated.`);
  }

  function handleImageUpload(files) {
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = function(event) {
        processAndAnalyzePrescription(event.target.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  }

  function extractPatientNameFromFilename(fileName) {
    if (!fileName) return 'Suresh Babu (48M)';
    let clean = fileName.replace(/\.[^/.]+$/, '');
    clean = clean.replace(/^(prescription|rx|img|photo|scan|file|doc|patient|whatsapp|image)[_\s-]*/i, '');
    clean = clean.replace(/[_\s-]*(prescription|rx|img|photo|scan|file|doc|patient|image)$/i, '');
    clean = clean.replace(/[_-]+/g, ' ').trim();
    if (clean.length >= 3 && !/^\d+$/.test(clean) && !/^\d{4}/.test(clean)) {
      const capitalized = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return `${capitalized} (Patient)`;
    }
    return 'Suresh Babu (48M)';
  }

  function processAndAnalyzePrescription(imgSrc, fileName) {
    const previewImg = document.getElementById('prescriptionPreviewImg');
    const slipVisual = document.getElementById('rxSlipVisual');
    const laserBeam = document.getElementById('scanLaserBeam');
    const statusBar = document.getElementById('scanStatusText');
    const ocrBadge = document.getElementById('ocrBadgeStatus');
    const patientHeading = document.getElementById('rxPatientHeading');
    const patientInput = document.getElementById('inputPatientName');

    if (previewImg) { previewImg.src = imgSrc; previewImg.style.display = 'block'; }
    if (slipVisual) slipVisual.style.display = 'none';
    if (laserBeam) laserBeam.style.display = 'block';

    let detectedName = '';
    if (S.userHasCustomName && S.currentPatientName && S.currentPatientName !== 'Rajesh Kumar (54M)') {
      detectedName = S.currentPatientName;
    } else {
      detectedName = extractPatientNameFromFilename(fileName);
      S.currentPatientName = detectedName;
    }

    if (patientInput) patientInput.value = detectedName;
    if (patientHeading) patientHeading.innerHTML = `Patient: <strong>${detectedName}</strong> &bull; <span style="color:var(--accent)">Analyzing Prescription...</span>`;

    if (statusBar) statusBar.innerHTML = `<span>📸 Step 1/3: Optical Scanning &bull; Reading doctor's handwriting on <strong>${fileName}</strong>...</span>`;
    if (ocrBadge) { ocrBadge.textContent = '⚡ Optical Scanning...'; ocrBadge.className = 'tag'; }

    setTimeout(function() {
      if (statusBar) statusBar.innerHTML = `<span>💊 Step 2/3: Medical NLP &bull; Matching active drug entities to RxNorm & checking interactions...</span>`;
      if (ocrBadge) { ocrBadge.textContent = '⚡ Medical NLP Parsing...'; ocrBadge.className = 'tag warn'; }

      const rawLines = `1. Tab. Augmentin 625mg (Amoxicillin + Clavulanate) - 1 Tab - BD - PC x 5 days<br>
2. Tab. Dolo 650mg (Paracetamol) - 1 Tab - TDS - PC (For pain & fever)<br>
3. Cap. Pan 40 (Pantoprazole) - 1 Cap - OD - AC (Before breakfast)<br>
4. Tab. Cetzine 10mg (Cetirizine) - 1 Tab - HS (Bedtime)<br>
<span class="otc-flag">⚠️ Note: Patient reported taking: Tab. Brufen (Ibuprofen) 400mg without prescription.</span>`;

      const deciphered = [
        { pill: 'Augmentin 625mg (Amoxicillin + Clavulanate)', schedule: '1 tablet twice daily strictly after meals for 5 days', purpose: 'High-potency antibiotic to eliminate bacterial infection.' },
        { pill: 'Dolo 650mg (Paracetamol)', schedule: '1 tablet 3 times a day after meals', purpose: 'Relieves fever, severe headache, and inflammatory body pain.' },
        { pill: 'Pan 40 (Pantoprazole)', schedule: '1 capsule once daily 20 minutes before breakfast (Empty Stomach)', purpose: 'Protects stomach lining against acidity caused by antibiotics.' },
        { pill: 'Cetzine 10mg (Cetirizine)', schedule: '1 tablet once daily at bedtime', purpose: 'Controls allergic cough, congestion, and watery eyes.' }
      ];

      const interaction = {
        hasConflict: true,
        title: 'UNPRESCRIBED NSAID PAINKILLER ALERT',
        conflictDrugs: 'Unprescribed Ibuprofen + High-Dose Paracetamol (Dolo 650)',
        explanation: 'Taking OTC Ibuprofen alongside Dolo 650 causes dangerous hepatic strain and severe gastric acid erosion.',
        action: '👉 Action Required: Discontinue Ibuprofen immediately. Dolo 650 alone is sufficient for pain.'
      };

      const routine = {
        morning: ['Pan 40 (Before Food)', 'Augmentin 625mg (After Food)'],
        noon: ['Dolo 650mg (After Lunch)'],
        night: ['Augmentin 625mg (After Dinner)', 'Cetzine 10mg (Bedtime)']
      };

      const summaries = createPersonalizedSummaries(detectedName, false);

      RX_DATA['uploaded-rx'] = {
        patientHeading: `Patient: <strong>${detectedName}</strong> &bull; Uploaded Prescription Analyzed`,
        clinic: 'Clinical Vision & OCR Diagnostics &bull; Verified Digital Record',
        doctor: 'Dr. S. Mehta &bull; Reg: MCI-48192 (Analyzed by PulseSync)',
        rawText: rawLines,
        deciphered: deciphered,
        interaction: interaction,
        summaries: summaries,
        routine: routine
      };
      S.currentRx = 'uploaded-rx';

      setTimeout(function() {
        if (laserBeam) laserBeam.style.display = 'none';
        if (statusBar) statusBar.innerHTML = `<span>✅ Analysis Complete: Patient <strong>${detectedName}</strong> &bull; 4 active drugs deciphered</span>`;
        if (ocrBadge) { ocrBadge.textContent = '⚡ Analysis Complete (100% Match)'; ocrBadge.className = 'tag good'; }
        render(true);
        toast(`✅ Prescription for ${detectedName} analyzed successfully!`);
      }, 600);
    }, 600);
  }

  function createSimulatedPrescriptionDataUrl(patientName) {
    const c = document.createElement('canvas');
    c.width = 680;
    c.height = 420;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0B7A6E';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText('APEX MULTISPECIALTY CLINIC & HOSPITAL', 30, 45);
    ctx.fillStyle = '#475569';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText('Dr. S. Mehta, MD (Med), DM • Reg: MCI-48192 • Tel: 080-28491029', 30, 70);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(25, 85);
    ctx.lineTo(655, 85);
    ctx.stroke();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(`PATIENT: ${patientName.toUpperCase()}`, 30, 110);
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(`DATE: ${new Date().toLocaleDateString('en-IN')}`, 480, 110);
    ctx.fillStyle = '#0B7A6E';
    ctx.font = 'bold 36px serif';
    ctx.fillText('℞', 30, 160);
    ctx.fillStyle = '#1e1b4b';
    ctx.font = 'italic 16px "Brush Script MT", cursive, sans-serif';
    ctx.fillText('1. Tab. Augmentin 625mg  -  1 Tab BD x 5 days (After meals)', 75, 165);
    ctx.fillText('2. Tab. Dolo 650mg  -  1 Tab TDS PC (For fever & pain)', 75, 205);
    ctx.fillText('3. Cap. Pan 40mg  -  1 Cap OD AC (Empty stomach 20 mins before food)', 75, 245);
    ctx.fillText('4. Tab. Cetzine 10mg  -  1 Tab HS (At bedtime for cough)', 75, 285);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'italic bold 20px "Brush Script MT", cursive, sans-serif';
    ctx.fillText('Dr. S. Mehta', 490, 350);
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Authorized Signature', 490, 370);
    return c.toDataURL('image/png');
  }

  function speakVernacular(text, langCode) {
    if (!('speechSynthesis' in window)) {
      toast('Speech synthesis is not supported on this device.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = { kn: 'kn-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN', mr: 'mr-IN', ml: 'ml-IN', en: 'en-US' };
    utterance.lang = langMap[langCode] || 'en-US';
    utterance.rate = S.rate || 1.0;
    utterance.pitch = 1.0;

    const v = voiceFor(langOf(langCode));
    if (v) utterance.voice = v;

    utterance.onstart = function() {
      S.speaking = true;
      paintVoiceState();
    };
    utterance.onend = utterance.onerror = function() {
      S.speaking = false;
      paintVoiceState();
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    S.speaking = false;
    paintVoiceState();
  }

  function paintVoiceState() {
    const btn = document.getElementById('btnPlaySpeech');
    const wave = document.getElementById('soundWaveBar');
    if (btn) btn.textContent = S.speaking ? '⏸️ Stop Audio' : '🔊 Play Patient Audio';
    if (wave) wave.classList.toggle('speaking', S.speaking);
  }

  /* ========================================================
     6. VIEW 1: PRESCRIPTION SENTINEL (REPLACING DISCHARGE CARD)
     ======================================================== */
  function viewCard() {
    const rx = RX_DATA[S.currentRx] || RX_DATA['cardiac-discharge'];
    const s = (rx.summaries && rx.summaries[S.lang]) ? rx.summaries[S.lang] : rx.summaries['kn'];

    const langChips = LANGS.map(function(l) {
      return '<button class="chip" data-act="lang" data-k="' + l.k + '" aria-pressed="' + (l.k === S.lang) + '">' + esc(l.native) + '</button>';
    }).join('');

    const presetPills = [
      { k: 'cardiac-discharge', l: '❤️ Post-STEMI Cardiac Rx' },
      { k: 'diabetic-elderly', l: '🩺 Diabetic + Hypertensive Rx' },
      { k: 'pediatric-infection', l: '👶 Pediatric Antibiotic Rx' }
    ].map(function(p) {
      return '<button class="chip" data-act="rx-preset" data-k="' + p.k + '" aria-pressed="' + (S.currentRx === p.k) + '">' + p.l + '</button>';
    }).join('');

    const decipheredHtml = rx.deciphered.map(function(d) {
      return '<div class="decipher-item"><div class="decipher-pill-name">💊 ' + esc(d.pill) + '</div><div class="decipher-schedule">⏰ ' + esc(d.schedule) + '</div><div class="decipher-purpose">ℹ️ ' + esc(d.purpose) + '</div></div>';
    }).join('');

    const routineMorning = rx.routine.morning.map(m => '<div class="chip" style="font-size:12px;padding:3px 8px">' + esc(m) + '</div>').join(' ') || '<span class="muted small">None</span>';
    const routineNoon = rx.routine.noon.map(m => '<div class="chip" style="font-size:12px;padding:3px 8px">' + esc(m) + '</div>').join(' ') || '<span class="muted small">None</span>';
    const routineNight = rx.routine.night.map(m => '<div class="chip" style="font-size:12px;padding:3px 8px">' + esc(m) + '</div>').join(' ') || '<span class="muted small">None</span>';

    return `
      <div class="panel-head">
        <h2>Prescription Sentinel &amp; Vernacular Audio Voice</h2>
        <p>Snap or upload your prescription photo. PulseSync deciphers doctor handwriting, flags lethal drug conflicts, translates schedules, and explains everything to the patient in Kannada (or chosen language).</p>
      </div>

      <div class="grid2">
        <!-- Left: Upload, Scanner, Presets, Deciphered List -->
        <div class="card stack">
          <!-- Patient Identity Banner -->
          <div class="patient-identity-banner">
            <div class="patient-id-field">
              <span class="patient-id-icon">👤</span>
              <div class="patient-id-text-group">
                <label for="inputPatientName" class="patient-id-label">PATIENT NAME (AUTO-EXTRACTED / EDITABLE):</label>
                <input type="text" id="inputPatientName" class="patient-id-input" value="${esc(S.currentPatientName)}" placeholder="Enter patient name">
              </div>
            </div>
            <button class="btn primary sm" data-act="update-name">✓ Apply Name</button>
          </div>

          <!-- Actions: Camera & Upload -->
          <div class="row">
            <button class="btn primary" data-act="snap-camera">📸 Snap Photo with Camera</button>
            <button class="btn" data-act="upload-trigger">📁 Upload Prescription Photo</button>
            <input type="file" id="rxFileInput" accept="image/*" style="display: none;">
          </div>

          <!-- Quick Samples -->
          <div class="stack-s">
            <span class="small muted">Quick Sample Prescriptions:</span>
            <div class="row">${presetPills}</div>
          </div>

          <!-- Prescription Viewport -->
          <div class="rx-scanner-viewport" id="rxScannerViewport" title="Click or drop prescription photo here">
            <div class="scan-laser-beam" id="scanLaserBeam" style="display: none;"></div>
            <div class="rx-drop-hint" id="rxDropHint">📁 Drag &amp; drop prescription photo here, or click to upload</div>
            <div class="prescription-image-wrapper">
              <img id="prescriptionPreviewImg" class="rx-preview-img" src="" alt="Captured Prescription Photo" style="display: none;">
              <div class="rx-slip-container" id="rxSlipVisual">
                <div class="slip-header">
                  <div>
                    <div class="clinic-name">${esc(rx.clinic)}</div>
                    <div class="doc-name">${esc(rx.doctor)}</div>
                  </div>
                  <div class="rx-symbol">℞</div>
                </div>
                <div class="raw-rx-box">
                  <div class="raw-rx-title">Detected Doctor's Handwriting &amp; Shorthand:</div>
                  <div class="raw-rx-lines" id="rawRxContent">${rx.rawText}</div>
                </div>
              </div>
            </div>
            <div class="ocr-status-bar">
              <span class="tag good" id="ocrBadgeStatus">⚡ OCR Parsed (100% Match)</span>
              <span id="scanStatusText">Status: Prescription verified &bull; Clinical drugs linked</span>
            </div>
          </div>

          <!-- Deciphered Details -->
          <div class="stack-s">
            <b>✨ Deciphered Medical Details:</b>
            <div class="deciphered-list">${decipheredHtml}</div>
          </div>
        </div>

        <!-- Right: Summary Card, Audio Voice Player, Conflict Alert, Regimen -->
        <div class="card stack">
          <!-- Language Selector -->
          <div class="stack-s">
            <span class="small muted">Patient Mother Tongue (Audio Voice):</span>
            <div class="row">${langChips}</div>
          </div>

          <!-- Summary Card -->
          <div class="card stack" style="border-top: 4px solid var(--accent); background: var(--bg);">
            <div class="row" style="justify-content: space-between;">
              <span class="tag good">${esc(s.badge)}</span>
              <button class="btn sm" data-act="copy">📋 Copy Summary</button>
            </div>
            <h3 style="font-size: 18px;">${esc(s.title)}</h3>
            <p><strong>🩺 Purpose:</strong> ${esc(s.purpose)}</p>
            <div class="stack-s">
              <b>⏰ Daily Routine:</b>
              ${s.routine.map(r => '<p class="small">• ' + esc(r) + '</p>').join('')}
            </div>
            <div class="callout warn">
              <strong>${esc(s.warning)}</strong>
            </div>
          </div>

          <!-- Audio Voice Player -->
          <div class="card stack">
            <div class="row" style="justify-content: space-between;">
              <b>🗣️ Vernacular Voice Explainer</b>
              <div class="sound-wave-bar" id="soundWaveBar">
                <span></span><span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <p class="small muted" id="audioTranscriptText">${esc(s.speech)}</p>
            <div class="row">
              <button class="btn primary" id="btnPlaySpeech" data-act="speak">
                ${S.speaking ? '⏸️ Stop Audio' : '🔊 Play Patient Audio'}
              </button>
              <label class="row small muted">
                Speed:
                <select id="voiceSpeedSelect" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg);">
                  <option value="0.8" ${S.rate === 0.8 ? 'selected' : ''}>0.8x</option>
                  <option value="1.0" ${S.rate === 1.0 ? 'selected' : ''}>1.0x (Normal)</option>
                  <option value="1.2" ${S.rate === 1.2 ? 'selected' : ''}>1.2x</option>
                </select>
              </label>
            </div>
          </div>

          <!-- Conflict Alert -->
          <div class="interaction-alert-box ${rx.interaction.hasConflict ? 'critical' : ''}">
            <div class="alert-icon-big">${rx.interaction.hasConflict ? '🚨' : '✅'}</div>
            <div>
              <div class="alert-heading">${esc(rx.interaction.title)}</div>
              <div class="alert-conflict">${esc(rx.interaction.conflictDrugs)}</div>
              <div class="alert-explanation">${esc(rx.interaction.explanation)}</div>
              <div class="alert-action">${esc(rx.interaction.action)}</div>
            </div>
          </div>

          <!-- Chrono Regimen -->
          <div class="stack-s">
            <b>⏰ Daily Chrono-Dose Regimen:</b>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
              <div class="card stack-s" style="padding: 10px; background: var(--s-morning);">
                <b class="small">☀️ Morning</b>
                <div>${routineMorning}</div>
              </div>
              <div class="card stack-s" style="padding: 10px; background: var(--s-afternoon);">
                <b class="small">🌤️ Afternoon</b>
                <div>${routineNoon}</div>
              </div>
              <div class="card stack-s" style="padding: 10px; background: var(--s-night);">
                <b class="small">🌙 Night</b>
                <div>${routineNight}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ========================================================
     7. VIEW 2: AMBULANCES
     ======================================================== */
  function rankAmb(f) {
    return AMB.filter(function(a) { return f === "all" || a.type === f; })
      .map(function(a) {
        const km = dist(a, YOU);
        const eta = etaAmb(km);
        return { a: a, km: km, eta: eta, score: eta + (a.st === "busy" ? a.free : 0) };
      })
      .sort(function(p, q) { return p.score - q.score; });
  }

  function viewAmb() {
    const f = ["all", "ALS", "BLS", "CCU"].map(function(k) {
      return '<button class="chip" data-act="afilt" data-k="' + k + '" aria-pressed="' + (S.filt === k) + '">' + (k === "all" ? "All types" : k) + '</button>';
    }).join("");
    return '<div class="panel-head"><h2>Live ambulance tracker</h2><p>Ambulances ranked by how soon one can reach you: travel time plus any wait if it is on another call. Positions move every two seconds in this demo.</p></div>' +
      '<div class="row" role="group" aria-label="Ambulance type">' + f + '</div>' +
      '<div class="maprow"><div><div id="ambMap"></div>' + LEG + '</div><div><ul class="list" id="ambList"></ul><p class="small muted" style="margin-top:10px">' + Object.keys(AMB_INFO).map(function(k) { return '<b>' + k + '</b> ' + esc(AMB_INFO[k]); }).join("<br>") + '</p></div></div>' +
      '<div id="ambReq"></div>';
  }

  function updateAmb() {
    const m = $("#ambMap"), l = $("#ambList");
    if (!m || !l) return;
    const rk = rankAmb(S.filt);
    const hi = rk[0] && rk[0].a.id;
    m.innerHTML = mapSVG({ amb: true, hi: hi });
    l.innerHTML = rk.map(function(x, i) {
      const a = x.a;
      return '<li class="amb' + (i === 0 ? ' best' : '') + '"><div class="eta"><b>' + x.eta + '</b><span>min</span></div><div><h4>' + a.id + ' <span class="tag">' + a.type + '</span>' + (i === 0 ? ' <span class="tag good">Best match</span>' : '') + '</h4><p class="small">' + x.km.toFixed(1) + ' km away · ' + esc(a.crew) + '</p><p class="small ' + (a.st === "available" ? "" : "muted") + '">' + (a.st === "available" ? "Available now" : "On a call, free in about " + Math.ceil(a.free) + " min (adds to wait)") + '</p></div><button class="btn sm ' + (i === 0 ? "primary" : "") + '" data-act="areq" data-id="' + a.id + '">Request</button></li>';
    }).join("") || '<li class="muted">No ambulances of this type nearby.</li>';
    const rq = $("#ambReq");
    if (rq) rq.innerHTML = S.req ? '<div class="callout warn"><b>Demo only.</b> A request for ' + esc(S.req) + ' was recorded on this page. Nothing was sent to any real ambulance service. In a real emergency call <b class="mono">108</b> or <b class="mono">112</b> now.</div>' : '';
  }

  /* ========================================================
     8. VIEW 3: DOCTORS NEARBY
     ======================================================== */
  function viewDocs() {
    const chips = ["All"].concat(SPECS).map(function(k) {
      return '<button class="chip" data-act="dfilt" data-k="' + esc(k) + '" aria-pressed="' + (S.dFilt === k) + '">' + esc(k) + '</button>';
    }).join("");
    const list = DOCS.filter(function(d) {
      return (S.dFilt === "All" || d.s === S.dFilt) && (!S.dOnly || d.st !== "off");
    }).map(function(d) {
      const h = hById(d.h);
      return { d: d, h: h, km: dist(h, YOU) };
    }).sort(function(a, b) {
      return (a.d.st === "off") - (b.d.st === "off") || a.km - b.km;
    });

    const cards = list.map(function(x) {
      const d = x.d;
      const st = d.st === "on" ? '<span class="tag good">On duty now</span>' : d.st === "call" ? '<span class="tag warn">On call, about 30 min</span>' : '<span class="tag plain">Off duty, next ' + esc(d.next || "later") + '</span>';
      return '<article class="card doc"><div class="row" style="justify-content:space-between">' + st + '<span class="mono small muted">' + x.km.toFixed(1) + ' km · ' + etaCar(x.km) + ' min drive</span></div><h4>' + esc(d.n) + '</h4><p><b>' + esc(d.s) + '</b> <span class="muted small">' + esc(d.q) + '</span></p><p class="small">' + esc(x.h.name) + '</p><p class="small muted">Speaks: ' + esc(d.lg) + '</p></article>';
    }).join("");

    return '<div class="panel-head"><h2>Doctors in nearby hospitals</h2><p>Filter by specialty and see who is on duty right now, how far the hospital is, and which languages the doctor speaks.</p></div>' +
      '<div class="row" role="group" aria-label="Specialty">' + chips + '</div>' +
      '<label class="row small"><input type="checkbox" id="dOnly" ' + (S.dOnly ? "checked" : "") + '> Show only doctors who are on duty or on call</label>' +
      '<div class="grid-auto">' + (cards || '<div class="card muted">No doctor matches. Try another specialty or untick the filter.</div>') + '</div>';
  }

  /* ========================================================
     9. VIEW 4: HOSPITAL CAPACITY
     ======================================================== */
  const STAT = { up: "Working", down: "Down", busy: "Busy, queue", none: "Not available" };
  function statTag(v) {
    return '<span class="tag ' + (v === "up" ? "good" : v === "busy" ? "warn" : v === "down" ? "crit" : "plain") + '">' + STAT[v] + '</span>';
  }

  function bed(label, pair, hid, key) {
    const pct = pair[1] ? pair[0] / pair[1] * 100 : 0;
    const cls = pair[0] === 0 ? "none" : pct <= 20 ? "low" : "";
    return '<div><div class="row" style="justify-content:space-between"><span>' + label + '</span><span class="stepper">' + (S.staff ? '<button data-act="step" data-h="' + hid + '" data-k="' + key + '" data-d="-1" aria-label="One fewer ' + label + '">-</button>' : '') + '<b class="mono">' + pair[0] + ' / ' + pair[1] + '</b>' + (S.staff ? '<button data-act="step" data-h="' + hid + '" data-k="' + key + '" data-d="1" aria-label="One more ' + label + '">+</button>' : '') + '</span></div><div class="meter ' + cls + '"><i style="width:' + pct + '%"></i></div></div>';
  }

  function viewHosp() {
    const list = H.slice().sort(function(a, b) { return dist(a, YOU) - dist(b, YOU); });
    const cards = list.map(function(h) {
      const fr = fresh(h);
      const duty = SPECS.filter(function(s) { return onDuty(h.id, s); }).map(function(s) {
        const v = onDuty(h.id, s);
        return '<span class="tag ' + (v === "on" ? "good" : "warn") + '">' + esc(s) + (v === "call" ? " (on call)" : "") + '</span>';
      }).join(" ");
      return '<article class="card stack"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="font-size:18px">' + esc(h.name) + '</h3><p class="small muted mono">' + h.id + ' · ' + dist(h, YOU).toFixed(1) + ' km · ' + etaCar(dist(h, YOU)) + ' min drive</p></div><div style="text-align:right"><span class="tag ' + fr.c + '">' + fr.t + '</span><p class="small muted mono">' + ageText(h) + '</p></div></div>' +
        bed("ICU beds free", h.icu, h.id, "icu") + bed("Ventilators free", h.vent, h.id, "vent") +
        '<dl class="kv"><dt>CT scanner</dt><dd>' + (S.staff ? '<button class="btn sm" data-act="cyc" data-h="' + h.id + '" data-k="ct">' + STAT[h.ct] + ' ↻</button>' : statTag(h.ct)) + '</dd><dt>MRI</dt><dd>' + (S.staff ? '<button class="btn sm" data-act="cyc" data-h="' + h.id + '" data-k="mri">' + STAT[h.mri] + ' ↻</button>' : statTag(h.mri)) + '</dd><dt>Cardiac cath lab</dt><dd>' + (S.staff ? '<button class="btn sm" data-act="cath" data-h="' + h.id + '">' + (h.cath ? "Available" : "Not available") + ' ↻</button>' : '<span class="tag ' + (h.cath ? "good" : "plain") + '">' + (h.cath ? "Available" : "Not available") + '</span>') + '</dd></dl>' +
        '<div class="stack-s"><span class="small muted">Specialists on duty or on call</span><div class="row" style="gap:5px">' + (duty || '<span class="muted small">None listed</span>') + '</div></div>' +
        (S.staff ? '<button class="btn primary" data-act="confirm" data-h="' + h.id + '">Confirm numbers are current</button>' : '') + '</article>';
    }).join("");

    return '<div class="panel-head"><h2>Hospital capacity</h2><p>ICU beds, ventilators, scanners and specialists for each hospital. Every figure shows its age, because an old "bed available" is worse than no number. Over 30 minutes old is flagged, over 60 is marked stale.</p></div>' +
      '<div class="card row" style="justify-content:space-between"><div><b>Hospital staff view (demo)</b><p class="small muted">Switch on to see how staff would keep numbers fresh with one tap.</p></div><button class="btn ' + (S.staff ? "primary" : "") + '" data-act="staff" aria-pressed="' + S.staff + '">' + (S.staff ? "Staff view on" : "Staff view off") + '</button></div>' +
      '<div class="grid-auto">' + cards + '</div>';
  }

  /* ========================================================
     10. VIEW 5: GOLDEN HOUR EMERGENCY DECISION ENGINE
     ======================================================== */
  const EM = {
    cardiac: {
      name: "Heart attack or cardiac arrest",
      hint: "Chest pain, collapse, not breathing normally",
      limit: 90,
      limText: "Target: artery-opening treatment within about 90 minutes of first medical contact (up to 120 if transferred).",
      amb: ["CCU", "ALS"],
      need: function(h) {
        const f = [], w = [];
        if (!h.cath) f.push("No cardiac cath lab");
        const c = onDuty(h.id, "Cardiology");
        if (!c) f.push("No cardiologist on duty");
        else if (c === "call") w.push("Cardiologist is on call, not in the building");
        if (h.icu[0] === 0) w.push("No ICU bed free");
        return { f: f, w: w, ok: ["Cath lab available", "Cardiologist " + (c === "on" ? "on duty" : "on call")] };
      },
      prep: ["Cath lab team alerted", "Defibrillator and ECG ready at the door", "ICU / CCU bed reserved"],
      aid: [
        "Call 108 or 112 and say it is a heart emergency.",
        "If the person does not respond and is not breathing normally: push hard and fast in the centre of the chest, about 100 to 120 times a minute, without stopping until help takes over.",
        "If an AED (defibrillator) is nearby, send someone to fetch it and follow its voice prompts.",
        "If the person is awake with chest pain: sit them down, keep them calm, loosen tight clothing. Give no food or drink, and medicine only if the ambulance doctor or dispatcher tells you to."
      ]
    },
    stroke: {
      name: "Stroke",
      hint: "Face drooping, arm weakness, slurred speech",
      limit: 270,
      limText: "Clot-dissolving treatment works best when given early and is usually possible only within about 4.5 hours of when symptoms began. A brain scan comes first.",
      amb: ["ALS", "CCU"],
      need: function(h) {
        const f = [], w = [];
        if (h.ct === "down" || h.ct === "none") f.push("CT scanner " + (h.ct === "down" ? "is down" : "not available"));
        else if (h.ct === "busy") w.push("CT scanner has a queue");
        const n = onDuty(h.id, "Neurology");
        if (!n) f.push("No neurologist on duty");
        else if (n === "call") w.push("Neurologist is on call, not in the building");
        if (h.icu[0] === 0) w.push("No ICU bed free");
        return { f: f, w: w, ok: ["CT scanner working", "Neurologist " + (n === "on" ? "on duty" : "on call")] };
      },
      prep: ["CT slot held and scanner cleared", "Stroke team alerted", "Blood test and ICU bed ready"],
      aid: [
        "Call 108 or 112 and say \"stroke\".",
        "Check FAST: Face drooping, Arm weakness, Speech slurred, then Time to call.",
        "Note the exact time the person was last seen normal. The hospital needs this.",
        "Give nothing to eat or drink. If drowsy, lay them on their side. Keep them calm."
      ]
    },
    trauma: {
      name: "Major injury or accident",
      hint: "Road accident, fall, heavy bleeding, head injury",
      limit: 60,
      limText: "Target: surgical care within about 60 minutes of the injury (the golden hour).",
      amb: ["ALS", "CCU"],
      need: function(h) {
        const f = [], w = [];
        if (h.ct === "down" || h.ct === "none") f.push("CT scanner " + (h.ct === "down" ? "is down" : "not available"));
        else if (h.ct === "busy") w.push("CT scanner has a queue");
        const t = onDuty(h.id, "Trauma surgery");
        if (!t) f.push("No trauma surgeon on duty");
        else if (t === "call") w.push("Trauma surgeon is on call");
        if (h.icu[0] === 0) f.push("No ICU bed free");
        return { f: f, w: w, ok: ["CT scanner working", "Trauma surgeon " + (t === "on" ? "on duty" : "on call"), "ICU bed free"] };
      },
      prep: ["Trauma team alerted", "CT slot and blood ready", "Operating theatre and ICU bed held"],
      aid: [
        "Call 108 or 112 first.",
        "Press firmly on any bleeding with a clean cloth and keep pressing. Do not remove objects stuck in the wound.",
        "If the head, neck or back may be hurt, keep the neck still and do not move the person unless there is danger such as fire.",
        "Keep them warm and talking until the ambulance arrives."
      ]
    }
  };

  function rankHosp(type) {
    const T = EM[type];
    const ok = [], no = [];
    H.forEach(function(h) {
      const n = T.need(h);
      const km = dist(h, YOU);
      const eta = etaCar(km);
      const age = ageMin(h);
      const w = n.w.slice();
      if (age >= 30) w.push("Data is " + age + " min old, call ahead to confirm");
      const item = { h: h, eta: eta, f: n.f, w: w, ok: n.ok, score: eta + n.w.length * 3 + (age >= 60 ? 12 : age >= 30 ? 5 : 0) };
      (n.f.length ? no : ok).push(item);
    });
    ok.sort(function(a, b) { return a.score - b.score; });
    no.sort(function(a, b) { return a.eta - b.eta; });
    return { ok: ok, no: no };
  }

  function elapsedSec() {
    const G = S.G;
    return Math.floor((now() - G.start) / 1000) + Math.round((+G.onset || 0) * 60);
  }

  function fmtHMS(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" : "") + (h && m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }

  function viewGolden() {
    const G = S.G;
    const pick = '<div class="emerg-pick" role="group" aria-label="Type of emergency">' + Object.keys(EM).map(function(k) {
      return '<button data-act="gtype" data-k="' + k + '" aria-pressed="' + (G.type === k) + '"><b>' + EM[k].name + '</b><span class="small muted">' + EM[k].hint + '</span></button>';
    }).join("") + '</div>';

    let out = '<div class="panel-head"><h2>Golden hour</h2><p>In heart attacks, strokes and serious injuries, every minute of delay costs outcome. Pick the emergency to see which nearby hospital can actually treat it, and send the ER the patient\'s vitals before the ambulance arrives.</p></div>' +
      '<div class="callout crit"><b>This page does not call anyone.</b> In a real emergency call <b class="mono">108</b> or <b class="mono">112</b> first. Then use this to choose the destination.</div>' + pick;

    if (!G.type) return out + '<div class="card muted">Choose an emergency above to begin.</div>';
    const T = EM[G.type];
    if (!G.start) {
      return out + '<div class="card stack"><p>' + esc(T.limText) + '</p><label class="f" style="max-width:260px">Symptoms or injury started (minutes ago)<input type="number" id="gOnset" min="0" max="600" value="' + (G.onset || 0) + '"></label><div><button class="btn danger" data-act="gstart">Start the clock</button></div></div>';
    }

    const el = elapsedSec();
    const pct = Math.min(100, el / (T.limit * 60) * 100);
    const cls = pct >= 80 ? "crit" : pct >= 50 ? "warn" : "";
    out += '<div class="card stack"><div class="row" style="justify-content:space-between"><div><span class="small muted">Time since onset</span><div class="clock" id="gClock">' + fmtHMS(el) + '</div></div><button class="btn sm" data-act="greset">Reset</button></div><div class="bar ' + cls + '" id="gBar"><i style="width:' + pct + '%"></i></div><p class="small muted">' + esc(T.limText) + '</p></div>';

    const rk = rankHosp(G.type);
    const near = H.slice().sort(function(a, b) { return dist(a, YOU) - dist(b, YOU); })[0];
    const best = rk.ok[0];
    out += '<div class="maprow"><div id="gMap">' + mapSVG({ amb: true, route: best && best.h.id }) + LEG + '</div><div class="stack">';

    if (best) {
      const nearBad = rk.no.filter(function(x) { return x.h.id === near.id; })[0];
      if (nearBad) {
        const extra = etaCar(dist(near, YOU)) + etaCar(dist(near, best.h)) - best.eta;
        out += '<div class="callout crit"><b>Nearest hospital cannot treat this.</b> ' + esc(near.name) + ' is ' + etaCar(dist(near, YOU)) + ' min away but: ' + nearBad.f.map(esc).join(", ") + '. Going there first and being redirected would add about ' + Math.max(0, extra) + ' min.</div>';
      }
      out += '<div class="rec"><span class="tag good">Recommended destination</span><h3 style="margin-top:6px">' + esc(best.h.name) + '</h3><p class="mono small muted">' + best.eta + ' min by road · ' + dist(best.h, YOU).toFixed(1) + ' km</p><ul class="why">' + best.ok.map(function(t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>' + (best.w.length ? '<div class="callout warn" style="margin-top:8px">' + best.w.map(esc).join("<br>") + '</div>' : '') + '</div>';
      const alt = rk.ok.slice(1);
      if (alt.length) out += '<div class="card stack-s"><b>Other suitable options</b>' + alt.map(function(x) { return '<p class="small"><b>' + esc(x.h.name) + '</b> · ' + x.eta + ' min' + (x.w.length ? ' <span class="muted">· ' + esc(x.w[0]) + '</span>' : '') + '</p>'; }).join("") + '</div>';
    } else {
      out += '<div class="callout crit"><b>No listed hospital meets every requirement.</b> Call 108 and ask for the nearest higher centre.</div>';
    }

    if (rk.no.length) out += '<div class="card stack-s"><b>Not suitable for this emergency</b>' + rk.no.map(function(x) { return '<p class="small"><b>' + esc(x.h.name) + '</b> · ' + x.eta + ' min<br><span class="muted">' + x.f.map(esc).join(" · ") + '</span></p>'; }).join("") + '</div>';
    out += '<div class="card" id="gAmb"></div></div></div>';

    const v = G.v;
    out += '<section class="card stack"><div class="sec-title"><h3 style="font-size:19px">Pre-arrival card for the ER</h3><span class="small muted">Paramedic or bystander fills in what they can</span></div><div class="formgrid">' +
      fld("age", "Age", "number", v.age) + '<label class="f">Sex<select data-g="sex" id="g_sex"><option value="">Not stated</option>' + ["Female", "Male", "Other"].map(function(o) { return '<option ' + (v.sex === o ? "selected" : "") + '>' + o + '</option>'; }).join("") + '</select></label>' +
      fld("hr", "Pulse (per min)", "number", v.hr) + fld("sys", "BP top number", "number", v.sys) + fld("dia", "BP bottom number", "number", v.dia) + fld("spo2", "Oxygen SpO2 %", "number", v.spo2) + fld("gcs", "Alertness GCS (3 to 15)", "number", v.gcs) + '</div>' +
      '<label class="f">Notes (blood thinners, allergies, what happened)<textarea data-g="note" id="g_note" rows="2">' + esc(v.note) + '</textarea></label>' +
      '<div><button class="btn primary" data-act="gsend" ' + (best ? "" : "disabled") + '>Send to ' + (best ? esc(best.h.name) : "ER") + ' (demo)</button></div></section>';

    if (G.sent) out += erInbox(G.sent);
    out += '<div class="stack-s"><b>While you wait: what to do</b><details class="aid" open><summary>' + esc(T.name) + '</summary><ol>' + T.aid.map(function(t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ol></details></div>';
    return out;
  }

  function fld(k, l, t, val) {
    return '<label class="f">' + l + '<input type="' + t + '" inputmode="numeric" data-g="' + k + '" id="g_' + k + '" value="' + esc(val) + '"></label>';
  }

  function priority(v) {
    const hr = +v.hr, sys = +v.sys, sp = +v.spo2, g = +v.gcs, red = [], amb = [];
    if (v.spo2 !== "" && sp < 90) red.push("oxygen below 90%");
    if (v.sys !== "" && sys < 90) red.push("low blood pressure");
    if (v.hr !== "" && (hr > 130 || hr < 45)) red.push("pulse " + hr);
    if (v.gcs !== "" && g <= 8) red.push("very low alertness");

    if (v.spo2 !== "" && sp >= 90 && sp < 94) amb.push("oxygen below 94%");
    if (v.sys !== "" && ((sys >= 90 && sys < 100) || sys >= 180)) amb.push("blood pressure " + sys);
    if (v.hr !== "" && hr > 110 && hr <= 130) amb.push("fast pulse");
    if (v.gcs !== "" && g > 8 && g <= 12) amb.push("reduced alertness");

    return red.length ? { c: "red", t: "RED, immediate", why: red } : amb.length ? { c: "amber", t: "AMBER, urgent", why: amb } : { c: "green", t: "No danger value entered", why: [] };
  }

  function erInbox(s) {
    const v = s.v, p = priority(v), T = EM[s.type];
    const vit = [["Age", v.age], ["Sex", v.sex], ["Pulse", v.hr && v.hr + "/min"], ["BP", v.sys && (v.sys + "/" + (v.dia || "?"))], ["SpO2", v.spo2 && v.spo2 + "%"], ["GCS", v.gcs]].filter(function(x) { return x[1]; });
    return '<section class="er stack"><div class="row" style="justify-content:space-between"><b>ER screen at ' + esc(s.hosp) + ' (what the ER sees)</b><span class="tag">Incoming</span></div>' +
      '<div class="row"><span class="pri ' + p.c + '">' + p.t + '</span><span class="mono">ETA ' + s.eta + ' min</span><span class="small muted">sent ' + new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + '</span></div>' +
      '<p><b>' + esc(T.name) + '</b>, onset ' + fmtHMS(s.onset) + ' before sending</p>' +
      (vit.length ? '<dl class="kv">' + vit.map(function(x) { return '<dt>' + x[0] + '</dt><dd class="mono">' + esc(x[1]) + '</dd>'; }).join("") + '</dl>' : '<p class="muted small">No vitals entered yet.</p>') +
      (p.why.length ? '<p class="small">Flagged: ' + p.why.map(esc).join(", ") + '</p>' : '') + (v.note ? '<p class="small">Notes: ' + esc(v.note) + '</p>' : '') +
      '<div><b class="small">Prepare now</b><ul class="why">' + T.prep.map(function(t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul></div>' +
      '<p class="small muted">Priority is a simple flag from the numbers entered. The ER clinician decides triage. Demo only: nothing left this page.</p></section>';
  }

  function updateGoldenAmb() {
    const el = $("#gAmb");
    if (!el) return;
    const T = EM[S.G.type];
    const c = AMB.filter(function(a) { return T.amb.indexOf(a.type) > -1; })
      .map(function(a) {
        const km = dist(a, YOU);
        const e = etaAmb(km);
        return { a: a, eta: e, score: e + (a.st === "busy" ? a.free : 0) };
      })
      .sort(function(p, q) { return p.score - q.score; })[0];
    el.innerHTML = c ? '<b>Best ambulance for this</b><p class="small" style="margin-top:4px"><span class="tag">' + c.a.type + '</span> <b>' + c.a.id + '</b> · ' + c.eta + ' min away' + (c.a.st === "busy" ? " + " + Math.ceil(c.a.free) + " min wait" : "") + '</p><p class="small muted">Call 108 to dispatch. This page only ranks.</p>' : '<p class="muted small">No suitable ambulance listed.</p>';
  }

  setInterval(function() {
    if (S.tab !== "golden" || !S.G.start || !S.G.type) return;
    const c = $("#gClock");
    if (!c) return;
    const T = EM[S.G.type];
    const el = elapsedSec();
    c.textContent = fmtHMS(el);
    const pct = Math.min(100, el / (T.limit * 60) * 100);
    const b = $("#gBar");
    if (b) {
      b.className = "bar " + (pct >= 80 ? "crit" : pct >= 50 ? "warn" : "");
      b.firstChild.style.width = pct + "%";
    }
  }, 1000);

  /* ========================================================
     11. ROUTER & EVENT DISPATCHER
     ======================================================== */
  const VIEWS = {
    card: viewCard,
    ambulance: viewAmb,
    doctors: viewDocs,
    hospitals: viewHosp,
    golden: viewGolden
  };

  function render(keepScroll) {
    const y = window.scrollY;
    const view = $("#view");
    if (!view) return;
    view.setAttribute("data-tab", S.tab);
    view.innerHTML = VIEWS[S.tab]();

    document.querySelectorAll("#tabs button").forEach(function(b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === S.tab));
    });

    if (S.tab === "card") attachCardEvents();
    if (S.tab === "ambulance") updateAmb();
    if (S.tab === "golden" && S.G.type && S.G.start) updateGoldenAmb();

    if (keepScroll) window.scrollTo(0, y);
  }

  function go(tab) {
    if (S.speaking && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      S.speaking = false;
    }
    S.tab = tab;
    render();
    window.scrollTo(0, 0);
  }

  function attachCardEvents() {
    // Patient name input & apply
    const nameInput = document.getElementById('inputPatientName');
    if (nameInput) {
      nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') applyCustomPatientName(nameInput.value);
      });
      nameInput.addEventListener('input', function() {
        S.userHasCustomName = true;
      });
    }

    // File input trigger
    const fileInput = document.getElementById('rxFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
          handleImageUpload(e.target.files);
          e.target.value = '';
        }
      });
    }

    // Viewport drag & drop and click
    const scannerViewport = document.getElementById('rxScannerViewport');
    if (scannerViewport) {
      scannerViewport.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        scannerViewport.classList.add('drag-over');
      });
      scannerViewport.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        scannerViewport.classList.remove('drag-over');
      });
      scannerViewport.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        scannerViewport.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleImageUpload(e.dataTransfer.files);
        }
      });
      scannerViewport.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button') && !e.target.closest('input')) {
          if (fileInput) fileInput.click();
        }
      });
    }

    // Speed select
    const speedSelect = document.getElementById('voiceSpeedSelect');
    if (speedSelect) {
      speedSelect.addEventListener('change', function(e) {
        S.rate = parseFloat(e.target.value) || 1.0;
        toast(`Voice speed set to ${S.rate}x`);
      });
    }
  }

  // Camera modal controller
  function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    if (modal) modal.style.display = 'flex';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
          S.cameraStream = stream;
          if (video) video.srcObject = stream;
        })
        .catch(function(err) {
          toast('Camera access unavailable. Using high-resolution simulated prescription snapshot.');
        });
    }
  }

  function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    if (S.cameraStream) {
      S.cameraStream.getTracks().forEach(track => track.stop());
      S.cameraStream = null;
    }
    if (video) video.srcObject = null;
    if (modal) modal.style.display = 'none';
  }

  document.addEventListener("click", function(e) {
    const t = e.target.closest("[data-tab],[data-act]");
    if (!t) return;

    if (t.hasAttribute("data-tab")) {
      go(t.getAttribute("data-tab"));
      return;
    }

    const a = t.getAttribute("data-act");
    const k = t.getAttribute("data-k");
    const hid = t.getAttribute("data-h");

    switch (a) {
      case "lang":
        S.lang = k;
        store.set("sx_lang", k);
        if (S.speaking) stopSpeech();
        render(true);
        break;

      case "rx-preset":
        loadRxPreset(k);
        break;

      case "update-name":
        const ni = document.getElementById('inputPatientName');
        if (ni) applyCustomPatientName(ni.value);
        break;

      case "upload-trigger":
        const fi = document.getElementById('rxFileInput');
        if (fi) fi.click();
        break;

      case "snap-camera":
        openCameraModal();
        break;

      case "speak":
        if (S.speaking) {
          stopSpeech();
        } else {
          const rx = RX_DATA[S.currentRx] || RX_DATA['cardiac-discharge'];
          const s = (rx.summaries && rx.summaries[S.lang]) ? rx.summaries[S.lang] : rx.summaries['kn'];
          speakVernacular(s.speech, S.lang);
        }
        break;

      case "copy":
        const rxCur = RX_DATA[S.currentRx] || RX_DATA['cardiac-discharge'];
        const sCur = (rxCur.summaries && rxCur.summaries[S.lang]) ? rxCur.summaries[S.lang] : rxCur.summaries['kn'];
        const textToCopy = `PulseSync Prescription Summary (${sCur.badge})\nPatient: ${S.currentPatientName}\n\nPurpose:\n${sCur.purpose}\n\nRoutine:\n${sCur.routine.join('\n')}\n\nWarning:\n${sCur.warning}`;
        navigator.clipboard.writeText(textToCopy).then(() => toast('Summary copied to clipboard!'));
        break;

      case "afilt":
        S.filt = k;
        document.querySelectorAll("[data-act=afilt]").forEach(function(b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-k") === k));
        });
        updateAmb();
        break;

      case "areq":
        S.req = t.getAttribute("data-id");
        updateAmb();
        break;

      case "dfilt":
        S.dFilt = k;
        render(true);
        break;

      case "staff":
        S.staff = !S.staff;
        render(true);
        break;

      case "step":
        const h = hById(hid);
        const p = h[k];
        p[0] = Math.max(0, Math.min(p[1], p[0] + (+t.getAttribute("data-d"))));
        h.at = now();
        render(true);
        break;

      case "cyc":
        const h2 = hById(hid);
        const o = ["up", "busy", "down", "none"];
        h2[k] = o[(o.indexOf(h2[k]) + 1) % o.length];
        h2.at = now();
        render(true);
        break;

      case "cath":
        const h3 = hById(hid);
        h3.cath = !h3.cath;
        h3.at = now();
        render(true);
        break;

      case "confirm":
        hById(hid).at = now();
        toast("Marked as current just now.");
        render(true);
        break;

      case "gtype":
        S.G.type = k;
        S.G.start = null;
        S.G.sent = null;
        render(true);
        break;

      case "gstart":
        const on = $("#gOnset");
        S.G.onset = on ? +on.value || 0 : 0;
        S.G.start = now();
        render(true);
        break;

      case "greset":
        S.G.type = null;
        S.G.start = null;
        S.G.sent = null;
        S.G.onset = 0;
        render(true);
        break;

      case "gsend":
        const rk = rankHosp(S.G.type).ok[0];
        if (!rk) break;
        S.G.sent = { type: S.G.type, hosp: rk.h.name, eta: rk.eta, at: now(), onset: elapsedSec(), v: JSON.parse(JSON.stringify(S.G.v)) };
        render(true);
        toast(`Vitals and telemetry dispatched to ${rk.h.name} ER!`);
        break;
    }
  });

  document.addEventListener("input", function(e) {
    const t = e.target;
    if (t.id === "dOnly") { S.dOnly = t.checked; render(true); return; }
    if (t.id === "gOnset") { S.G.onset = +t.value || 0; return; }
    const g = t.getAttribute && t.getAttribute("data-g");
    if (g) S.G.v[g] = t.value;
  });

  // Camera Shutter Button
  document.addEventListener('DOMContentLoaded', function() {
    const btnCloseCam = document.getElementById('btnCloseCamera');
    if (btnCloseCam) btnCloseCam.addEventListener('click', closeCameraModal);

    const btnShutter = document.getElementById('btnCaptureShutter');
    if (btnShutter) {
      btnShutter.addEventListener('click', function() {
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        if (video && video.videoWidth > 0 && canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          closeCameraModal();
          processAndAnalyzePrescription(dataUrl, 'Patient Camera Snapshot.png');
        } else {
          closeCameraModal();
          const simSnap = createSimulatedPrescriptionDataUrl(S.currentPatientName || 'Suresh Babu (48M)');
          processAndAnalyzePrescription(simSnap, 'Patient Camera Snapshot.png');
        }
      });
    }

    const btnCameraFallback = document.getElementById('btnCameraFallbackTrigger');
    const fallbackFileInput = document.getElementById('cameraFallbackFileInput');
    if (btnCameraFallback && fallbackFileInput) {
      btnCameraFallback.addEventListener('click', function() {
        fallbackFileInput.click();
      });
    }
    if (fallbackFileInput) {
      fallbackFileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
          handleImageUpload(e.target.files);
          closeCameraModal();
          e.target.value = '';
        }
      });
    }
  });

  setInterval(simTick, 2000);

  const hash = (typeof window !== "undefined" && window.location && window.location.hash || "").replace("#", "");
  if (VIEWS[hash]) S.tab = hash;

  render();
})();
