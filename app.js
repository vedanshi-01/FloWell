/**
 * ============================================================================
 * FloWell: Your Period Partner — Core Application Logic
 * ============================================================================
 * Features:
 * - Cycle prediction engine with medical estimation disclaimers
 * - History storage & management using localStorage
 * - Mira: Interactive AI Wellness Buddy
 * ============================================================================
 */

const STORAGE_KEY_HISTORY = "flowell_cycle_history";

// State variable for the latest calculation
let lastCalculatedResult = null;

// ============================================================================
// 1. USER SESSION & AVATAR PERSONALIZATION
// ============================================================================
function initUserSession() {
  const avatarElement = document.getElementById("userAvatarEmoji");
  const nameElement = document.getElementById("userNameText");
  const user = typeof checkUserSession === "function" ? checkUserSession() : null;

  if (user) {
    if (avatarElement) avatarElement.innerText = user.avatar || "🌸";
    if (nameElement) nameElement.innerText = user.name || "Demo User";
    if (user.cycleLength) {
      const cycleInput = document.getElementById("cycleLength");
      if (cycleInput) cycleInput.value = user.cycleLength;
    }
    if (user.lastPeriod) {
      const lastPeriodInput = document.getElementById("lastPeriod");
      if (lastPeriodInput) lastPeriodInput.value = user.lastPeriod;
    }
  } else {
    if (avatarElement) avatarElement.innerText = "🌸";
    if (nameElement) nameElement.innerText = "Demo Guest";
  }
}

// ============================================================================
// 2. AVATAR CUSTOMIZATION MODAL (DASHBOARD)
// ============================================================================
function openAvatarModal() {
  const modal = document.getElementById("avatarModal");
  if (!modal) return;
  modal.style.display = "flex";

  const user = typeof checkUserSession === "function" ? checkUserSession() : null;
  const currentAvatar = (user && user.avatar) ? user.avatar : "🌸";

  const buttons = modal.querySelectorAll(".avatar-item-btn");
  buttons.forEach(btn => {
    if (btn.innerText.trim() === currentAvatar) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function closeAvatarModal() {
  const modal = document.getElementById("avatarModal");
  if (modal) modal.style.display = "none";
}

function handleModalBackdropClick(e) {
  if (e.target && e.target.id === "avatarModal") {
    closeAvatarModal();
  }
}

function selectDashboardAvatar(newAvatar) {
  if (typeof updateUserAvatar === "function") {
    updateUserAvatar(newAvatar);
  }
  const avatarElement = document.getElementById("userAvatarEmoji");
  if (avatarElement) avatarElement.innerText = newAvatar;

  const modal = document.getElementById("avatarModal");
  if (modal) {
    const buttons = modal.querySelectorAll(".avatar-item-btn");
    buttons.forEach(btn => {
      if (btn.innerText.trim() === newAvatar) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  setTimeout(() => {
    closeAvatarModal();
  }, 220);
}

// ============================================================================
// 3. PERIOD TRACKER CALCULATION ENGINE & VALIDATION
// Satisfies Test Case 3: (10 Oct 2025 + 28 days = 7 Nov 2025)
// Satisfies Test Case 4: (Empty input validation -> "Please enter all fields")
// Requirement: Label all predictions as estimates, not medical certainties.
// ============================================================================

/**
 * Helper: format Date object to YYYY-MM-DD
 */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Helper: format timestamp (Firestore Timestamp, ISO string, or number) for display
 */
function formatCreatedAt(ts) {
  if (!ts) return new Date().toLocaleDateString("en-GB");
  if (typeof ts.toDate === "function") {
    return ts.toDate().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
  }
  return String(ts);
}

/**
 * Validates cycle dates and reasonable cycle length constraints
 */
function validateCycleInputs(lastPeriodVal, cycleLengthVal) {
  if (!lastPeriodVal || typeof lastPeriodVal !== "string" || !lastPeriodVal.trim()) {
    return { valid: false, message: "Please select your last period start date." };
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(lastPeriodVal.trim())) {
    return { valid: false, message: "Please enter date in YYYY-MM-DD format." };
  }

  const parts = lastPeriodVal.trim().split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, message: "Please enter a valid calendar date." };
  }

  const testDate = new Date(year, month - 1, day);
  if (
    isNaN(testDate.getTime()) ||
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) {
    return { valid: false, message: "Please enter a valid calendar date." };
  }

  if (year < 1990 || year > 2100) {
    return { valid: false, message: "Please select a date within a realistic year (1990–2100)." };
  }

  const len = Number(cycleLengthVal);
  if (isNaN(len) || !Number.isInteger(len) || len < 15 || len > 60) {
    return { valid: false, message: "Average cycle length must be between 15 and 60 days." };
  }

  return { valid: true };
}

function calculatePeriod() {
  const lastPeriodInput = document.getElementById("lastPeriod");
  const cycleLengthInput = document.getElementById("cycleLength");
  const resultContainer = document.getElementById("result");

  if (!lastPeriodInput || !cycleLengthInput || !resultContainer) return;

  const lastPeriodVal = lastPeriodInput.value.trim();
  const cycleLengthVal = parseInt(cycleLengthInput.value, 10);

  // Validation Test Case 4: Empty fields validation
  if (!lastPeriodVal || isNaN(cycleLengthVal) || cycleLengthVal <= 0) {
    resultContainer.innerHTML = `<div class="result-error">Please enter all fields</div>`;
    lastCalculatedResult = null;
    return;
  }

  const validation = validateCycleInputs(lastPeriodVal, cycleLengthVal);
  if (!validation.valid) {
    resultContainer.innerHTML = `<div class="result-error">${validation.message}</div>`;
    lastCalculatedResult = null;
    return;
  }

  // Timezone-safe date arithmetic
  // Parses YYYY-MM-DD components directly
  const dateParts = lastPeriodVal.split("-").map(Number);
  const year = dateParts[0];
  const month = dateParts[1] - 1; // 0-indexed in JS
  const day = dateParts[2];

  // Base date of last period
  const lastDate = new Date(year, month, day);

  // Predicted Next Period = Last Period Date + Cycle Length
  const nextDate = new Date(year, month, day + cycleLengthVal);

  // Estimated Ovulation Date = Next Period Date - 14 Days
  const ovulationDate = new Date(year, month, day + cycleLengthVal - 14);

  // Formatting helpers
  const nextPeriodISO = toISODate(nextDate);
  const ovulationISO = toISODate(ovulationDate);

  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  const formattedNextPeriod = nextDate.toLocaleDateString("en-GB", dateOptions);
  const formattedOvulation = ovulationDate.toLocaleDateString("en-GB", dateOptions);

  // Compute countdown relative to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = nextDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let countdownText = "";
  if (diffDays > 0) {
    countdownText = `⏳ Approximately <strong>${diffDays} day${diffDays === 1 ? "" : "s"}</strong> remaining until your estimated next cycle.`;
  } else if (diffDays === 0) {
    countdownText = `🌸 Today is your estimated cycle start day.`;
  } else {
    countdownText = `⏳ Your estimated cycle start was ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago.`;
  }

  // Cache calculation for saveHistory()
  lastCalculatedResult = {
    lastPeriod: lastPeriodVal,
    cycleLength: cycleLengthVal,
    nextPeriod: formattedNextPeriod,
    nextPeriodISO: nextPeriodISO,
    ovulation: formattedOvulation,
    ovulationISO: ovulationISO,
    timestamp: new Date().toLocaleString()
  };

  // Render Result with Explicit Medical Estimation Disclaimer
  resultContainer.innerHTML = `
    <div class="result-card">
      <div class="result-date-highlight">
        <span>✨ Predicted Next Period (Estimate):</span>
        <span>${formattedNextPeriod}</span>
      </div>
      <div class="result-meta">
        <p>🌸 <strong>Estimated Ovulation Window:</strong> Around ${formattedOvulation}</p>
        <p>${countdownText}</p>
      </div>
      <div class="disclaimer-badge">
        ⚠️ <strong>Medical Disclaimer:</strong> Menstrual cycle and ovulation dates are mathematical estimates based on average cycle lengths, not medical certainties or diagnostic advice. Cycles naturally vary due to stress, sleep, and lifestyle. Consult a licensed healthcare provider for clinical questions or family planning.
      </div>
    </div>
  `;
}

// ============================================================================
// 4. HISTORY MANAGEMENT (Phase 3: Cloud Firestore & Demo Mode Isolation)
// ============================================================================

/**
 * Saves current calculated record to Cloud Firestore (/users/{uid}/cycle_records)
 * or to isolated sessionStorage for Demo Users.
 */
async function saveHistory() {
  const resultContainer = document.getElementById("result");
  const historyContainer = document.getElementById("history");

  if (!lastCalculatedResult) {
    if (resultContainer) {
      resultContainer.innerHTML = `<div class="result-error">Please calculate your period prediction first before saving!</div>`;
    }
    return;
  }

  // Validate inputs
  const validation = validateCycleInputs(lastCalculatedResult.lastPeriod, lastCalculatedResult.cycleLength);
  if (!validation.valid) {
    if (resultContainer) {
      resultContainer.innerHTML = `<div class="result-error">${validation.message}</div>`;
    }
    return;
  }

  const demoActive = typeof isDemoSessionActive === "function" && isDemoSessionActive();

  // --------------------------------------------------------------------------
  // 1. ISOLATED DEMO SESSION (Stored only in sessionStorage, never uploaded to cloud)
  // --------------------------------------------------------------------------
  if (demoActive) {
    const demoRecord = {
      lastPeriod: lastCalculatedResult.lastPeriod,
      cycleLength: Number(lastCalculatedResult.cycleLength),
      nextPeriod: lastCalculatedResult.nextPeriodISO || lastCalculatedResult.nextPeriod,
      ovulation: lastCalculatedResult.ovulationISO || lastCalculatedResult.ovulation,
      isEstimate: true,
      ovulationIsEstimate: true,
      nextPeriodFormatted: lastCalculatedResult.nextPeriod,
      ovulationFormatted: `${lastCalculatedResult.ovulation} (Estimated)`,
      createdAt: new Date().toISOString(),
      isDemo: true
    };

    let demoHistory = [];
    try {
      if (typeof sessionStorage !== "undefined") {
        demoHistory = JSON.parse(sessionStorage.getItem("flowell_demo_cycle_history") || "[]");
      }
    } catch (e) {
      demoHistory = [];
    }

    demoHistory.unshift(demoRecord);
    if (demoHistory.length > 10) {
      demoHistory = demoHistory.slice(0, 10);
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("flowell_demo_cycle_history", JSON.stringify(demoHistory));
      }
    } catch (e) {
      console.error("Failed to save demo history:", e);
    }

    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-item" style="border-left: 3px solid var(--accent-sage);">
          <div class="history-item-details">
            <span class="badge-demo">🖥️ Demo Session (Local)</span>
            <br>
            <span>✅ <strong>Saved to Demo Session!</strong> (${lastCalculatedResult.nextPeriod})</span>
            <br>
            <small style="color: var(--text-muted);">Demo records are stored in this browser session only and never sent to the cloud.</small>
          </div>
        </div>
      `;
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 2. AUTHENTICATED FIREBASE USER (Saved to Cloud Firestore: /users/{uid}/cycle_records)
  // --------------------------------------------------------------------------
  const fb = typeof getFirebase === "function" ? getFirebase() : (typeof window !== "undefined" ? window.FloWellFirebase : null);
  const user = fb && fb.auth ? fb.auth.currentUser : null;

  if (!user) {
    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-error">
          Please log in with your FloWell account to save your cycle history to the cloud.
        </div>
      `;
    }
    return;
  }

  // Security: Always use the authenticated Firebase UID directly from fb.auth.currentUser
  const uid = user.uid;

  if (historyContainer) {
    historyContainer.innerHTML = `<div class="history-loading">☁️ Saving cycle record to FloWell Cloud...</div>`;
  }

  const recordData = {
    lastPeriod: lastCalculatedResult.lastPeriod,
    cycleLength: Number(lastCalculatedResult.cycleLength),
    nextPeriod: lastCalculatedResult.nextPeriodISO || lastCalculatedResult.nextPeriod,
    ovulation: lastCalculatedResult.ovulationISO || lastCalculatedResult.ovulation,
    isEstimate: true,
    ovulationIsEstimate: true,
    ovulationNotes: "Estimated ovulation date (not clinical certainty)",
    nextPeriodFormatted: lastCalculatedResult.nextPeriod,
    ovulationFormatted: `${lastCalculatedResult.ovulation} (Estimated)`,
    createdAt: (fb.serverTimestamp && typeof fb.serverTimestamp === "function")
      ? fb.serverTimestamp()
      : new Date().toISOString()
  };

  try {
    // Ensure parent /users/{uid} document exists so subcollections are never orphaned
    try {
      const userDocRef = fb.doc(fb.db, "users", uid);
      const userSnap = await fb.getDoc(userDocRef);
      if (!userSnap || !userSnap.exists || !userSnap.exists()) {
        const fallbackProfile = {
          name: user.displayName || (user.email ? user.email.split("@")[0] : "FloWell User"),
          email: (user.email || "").toLowerCase(),
          avatar: "🌸",
          cycleLength: Number(lastCalculatedResult.cycleLength) || 28,
          createdAt: new Date().toISOString()
        };
        await fb.setDoc(userDocRef, fallbackProfile, { merge: true });
      }
    } catch (parentErr) {
      console.warn("Notice: Parent profile verification:", parentErr.message);
    }

    const colRef = fb.collection(fb.db, "users", uid, "cycle_records");
    await fb.addDoc(colRef, recordData);

    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-item" style="border-left: 3px solid var(--accent-sage);">
          <div class="history-item-details">
            <span class="badge-cloud">☁️ FloWell Cloud</span>
            <br>
            <span>✅ <strong>Saved to Cloud!</strong> (${lastCalculatedResult.nextPeriod})</span>
            <br>
            <span class="history-timestamp">Click "View History" to inspect all entries</span>
          </div>
        </div>
      `;
    }
  } catch (error) {
    // Privacy: Do not log sensitive health data or tokens to console
    console.error("FloWell Cloud Save Error:", error.code || error.message);
    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-error">
          ❌ Failed to save to FloWell Cloud: ${error.message || "Permission denied or connection issue."}
        </div>
      `;
    }
  }
}

/**
 * Views saved cycle records from Cloud Firestore (for Firebase users)
 * or isolated sessionStorage (for Demo users).
 * Displays up to 10 latest records, newest first.
 */
async function viewHistory() {
  const historyContainer = document.getElementById("history");
  if (!historyContainer) return;

  const demoActive = typeof isDemoSessionActive === "function" && isDemoSessionActive();

  // --------------------------------------------------------------------------
  // 1. ISOLATED DEMO SESSION
  // --------------------------------------------------------------------------
  if (demoActive) {
    let demoHistory = [];
    try {
      if (typeof sessionStorage !== "undefined") {
        demoHistory = JSON.parse(sessionStorage.getItem("flowell_demo_cycle_history") || "[]");
      }
    } catch (e) {
      demoHistory = [];
    }

    if (demoHistory.length === 0) {
      historyContainer.innerHTML = `
        <div class="history-empty">
          📜 No demo cycle records saved yet. Enter your dates, click <strong>Predict Next Period</strong>, and press <strong>💾 Save Prediction</strong>.
          <br><small style="color: var(--text-muted); font-size: 0.85rem;">Mode: Demo Session (Local storage only)</small>
        </div>
      `;
      return;
    }

    let html = `<div class="history-list">`;
    demoHistory.forEach((item, index) => {
      const displayNext = item.nextPeriodFormatted || item.nextPeriod;
      const displayOvulation = item.ovulationFormatted || (item.ovulation ? `${item.ovulation} (Estimate)` : "");
      const displayCreated = formatCreatedAt(item.createdAt);

      html += `
        <div class="history-item">
          <div class="history-item-details">
            <span class="badge-demo">🖥️ Demo Session (Local)</span>
            <br>
            <strong>Cycle #${demoHistory.length - index}</strong>: Last Period: ${item.lastPeriod} | Cycle: ${item.cycleLength} days
            <br>
            <span style="color: var(--primary-deep, #49354F); font-weight: 600;">✨ Predicted Next: ${displayNext}</span>
            ${displayOvulation ? `<br><small style="color: var(--text-muted, #7A697E);">🌸 Estimated Ovulation: ${displayOvulation}</small>` : ""}
          </div>
          <div class="history-timestamp">${displayCreated}</div>
        </div>
      `;
    });
    html += `</div>`;
    historyContainer.innerHTML = html;
    return;
  }

  // --------------------------------------------------------------------------
  // 2. AUTHENTICATED FIREBASE USER (Queried from Cloud Firestore: /users/{uid}/cycle_records)
  // --------------------------------------------------------------------------
  const fb = typeof getFirebase === "function" ? getFirebase() : (typeof window !== "undefined" ? window.FloWellFirebase : null);
  const user = fb && fb.auth ? fb.auth.currentUser : null;

  if (!user) {
    historyContainer.innerHTML = `
      <div class="history-empty">
        Please log in to view your saved menstrual cycle history.
      </div>
    `;
    return;
  }

  // Security: Always use authenticated UID
  const uid = user.uid;

  historyContainer.innerHTML = `<div class="history-loading">☁️ Loading your cycle records from FloWell Cloud...</div>`;

  try {
    const colRef = fb.collection(fb.db, "users", uid, "cycle_records");
    let recordsQuery = colRef;
    if (typeof fb.query === "function" && typeof fb.orderBy === "function" && typeof fb.limit === "function") {
      try {
        recordsQuery = fb.query(colRef, fb.orderBy("createdAt", "desc"), fb.limit(10));
      } catch (qErr) {
        recordsQuery = colRef;
      }
    }

    const querySnap = await fb.getDocs(recordsQuery);
    const records = [];

    querySnap.forEach((docSnap) => {
      records.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Client-side sort fallback to guarantee latest-first ordering
    records.sort((a, b) => {
      const getMillis = (val) => {
        if (!val) return 0;
        if (typeof val.toMillis === "function") return val.toMillis();
        if (typeof val.toDate === "function") return val.toDate().getTime();
        const d = new Date(val);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      return getMillis(b.createdAt) - getMillis(a.createdAt);
    });

    const latest10 = records.slice(0, 10);

    if (latest10.length === 0) {
      historyContainer.innerHTML = `
        <div class="history-empty">
          📜 No cloud cycle records saved yet. Enter your dates, click <strong>Predict Next Period</strong>, and press <strong>💾 Save Prediction</strong>.
          <br><small style="color: var(--text-muted); font-size: 0.85rem;">☁️ Synced with FloWell Cloud</small>
        </div>
      `;
      return;
    }

    let html = `<div class="history-list">`;
    latest10.forEach((item, index) => {
      const displayNext = item.nextPeriodFormatted || item.nextPeriod;
      const displayOvulation = item.ovulationFormatted || (item.ovulation ? `${item.ovulation} (Estimate)` : "");
      const displayCreated = formatCreatedAt(item.createdAt);

      html += `
        <div class="history-item">
          <div class="history-item-details">
            <span class="badge-cloud">☁️ FloWell Cloud Record</span>
            <br>
            <strong>Cycle #${latest10.length - index}</strong>: Last Period: ${item.lastPeriod} | Cycle: ${item.cycleLength} days
            <br>
            <span style="color: var(--primary-deep, #49354F); font-weight: 600;">✨ Predicted Next: ${displayNext}</span>
            ${displayOvulation ? `<br><small style="color: var(--text-muted, #7A697E);">🌸 Estimated Ovulation: ${displayOvulation}</small>` : ""}
          </div>
          <div class="history-timestamp">${displayCreated}</div>
        </div>
      `;
    });
    html += `</div>`;
    historyContainer.innerHTML = html;
  } catch (error) {
    console.error("FloWell Cloud Load Error:", error.code || error.message);
    historyContainer.innerHTML = `
      <div class="history-error">
        ❌ Failed to load cloud records: ${error.message || "Network error. Please try again."}
      </div>
    `;
  }
}

/**
 * Clears saved cycle history for the current authenticated user only
 * from Cloud Firestore (/users/{uid}/cycle_records) or from sessionStorage for Demo mode.
 */
async function clearHistory() {
  const historyContainer = document.getElementById("history");

  const demoActive = typeof isDemoSessionActive === "function" && isDemoSessionActive();

  // --------------------------------------------------------------------------
  // 1. ISOLATED DEMO SESSION
  // --------------------------------------------------------------------------
  if (demoActive) {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm("Are you sure you want to clear your demo cycle history?");
      if (!ok) return;
    }
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("flowell_demo_cycle_history");
      }
    } catch (e) {}

    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-empty">
          🧹 Demo history cleared successfully.
        </div>
      `;
    }
    return;
  }

  // --------------------------------------------------------------------------
  // 2. AUTHENTICATED FIREBASE USER
  // --------------------------------------------------------------------------
  const fb = typeof getFirebase === "function" ? getFirebase() : (typeof window !== "undefined" ? window.FloWellFirebase : null);
  const user = fb && fb.auth ? fb.auth.currentUser : null;

  if (!user) {
    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-error">Please log in to manage your cycle records.</div>
      `;
    }
    return;
  }

  // Security & Privacy: Explicit user confirmation required before permanent cloud deletion
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const ok = window.confirm(
      "Are you sure you want to permanently delete your cycle history from FloWell Cloud? This action cannot be undone."
    );
    if (!ok) return;
  }

  if (historyContainer) {
    historyContainer.innerHTML = `<div class="history-loading">🧹 Deleting cloud cycle records...</div>`;
  }

  try {
    const colRef = fb.collection(fb.db, "users", user.uid, "cycle_records");
    const querySnap = await fb.getDocs(colRef);

    if (querySnap.empty || querySnap.docs.length === 0) {
      if (historyContainer) {
        historyContainer.innerHTML = `<div class="history-empty">📜 No cloud records to delete.</div>`;
      }
      return;
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const docSnap of querySnap.docs) {
      try {
        const docRef = fb.doc(fb.db, "users", user.uid, "cycle_records", docSnap.id);
        await fb.deleteDoc(docRef);
        deletedCount++;
      } catch (delErr) {
        failedCount++;
        console.error("FloWell Cloud record deletion error for doc:", docSnap.id, delErr.code || delErr.message);
      }
    }

    if (failedCount > 0) {
      if (historyContainer) {
        historyContainer.innerHTML = `
          <div class="history-error">
            ⚠️ Partial deletion: ${deletedCount} record(s) deleted, ${failedCount} failed. Please try again.
          </div>
        `;
      }
    } else {
      if (historyContainer) {
        historyContainer.innerHTML = `
          <div class="history-empty">
            🧹 All cloud cycle records deleted successfully (${deletedCount} record${deletedCount === 1 ? "" : "s"}).
          </div>
        `;
      }
    }
  } catch (err) {
    console.error("FloWell Cloud clear history error:", err.code || err.message);
    if (historyContainer) {
      historyContainer.innerHTML = `
        <div class="history-error">
          ❌ Failed to clear cloud history: ${err.message || "Network error. Please try again."}
        </div>
      `;
    }
  }
}

// ============================================================================
// 4. MIRA WELLNESS CHATBOT (Formerly Sakhi)
// ============================================================================

/**
 * Sends a pre-configured chip prompt directly into chat
 */
function sendQuickPrompt(promptText) {
  const userInput = document.getElementById("userInput");
  if (!userInput) return;
  userInput.value = promptText;
  sendMessage();
}

/**
 * Handles sending messages and generating intelligent empathetic responses
 */
function sendMessage() {
  const userInput = document.getElementById("userInput");
  const chatbox = document.getElementById("chatbox");

  if (!userInput || !chatbox) return;

  const messageText = userInput.value.trim();
  if (!messageText) return;

  // Append user message
  const userDiv = document.createElement("div");
  userDiv.className = "message user";
  userDiv.innerText = messageText;
  chatbox.appendChild(userDiv);

  // Clear input
  userInput.value = "";
  chatbox.scrollTop = chatbox.scrollHeight;

  // Generate Mira's reply
  setTimeout(() => {
    const botReply = generateMiraResponse(messageText);
    const botDiv = document.createElement("div");
    botDiv.className = "message bot";
    botDiv.innerHTML = botReply;
    chatbox.appendChild(botDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
  }, 450);
}

/**
 * In-memory session state for conversational context and intelligent follow-ups
 */
const miraSession = {
  lastTopic: null,
  lastIntent: null,
  fallbackIndex: 0
};

/**
 * Text Normalization & Lexical Preprocessing
 * Cleans punctuation, expands contractions, and resolves common typos/phonetics.
 */
function normalizeText(input) {
  if (!input || typeof input !== "string") return "";
  let text = input.toLowerCase().trim();

  // Replace common contractions
  text = text
    .replace(/\bdon't\b/g, "dont")
    .replace(/\bcan't\b/g, "cant")
    .replace(/\bwon't\b/g, "wont")
    .replace(/\bshouldn't\b/g, "shouldnt")
    .replace(/\bi'm\b/g, "im")
    .replace(/\bit's\b/g, "its");

  // Fix common spelling mistakes & phonetic variations
  const typoMap = [
    [/\b(peirod|peariod|peroid|preiod|peirods|priod|priods)\b/g, "period"],
    [/\b(crampps|crampings|crampd|crump|crampp)\b/g, "cramp"],
    [/\b(exersise|excersise|exercize|exercis|wrkout|work out|exercisin)\b/g, "exercise"],
    [/\b(bleedng|bleading|blead|bleeded)\b/g, "bleeding"],
    [/\b(irregualr|iregular|unregular)\b/g, "irregular"],
    [/\b(hygene|hygeine|higene|hygine)\b/g, "hygiene"],
    [/\b(tamponn|tompon|tampons)\b/g, "tampon"],
    [/\b(bloatng|bloting|bloatted)\b/g, "bloating"],
    [/\b(headach|headche|migrane|migranes)\b/g, "headache"],
    [/\b(fatig|fatigu|exhaused|exhastion)\b/g, "fatigue"],
    [/\b(pregnent|preganant|pregant|prego)\b/g, "pregnant"],
    [/\b(nausia|nausious|nauseated)\b/g, "nausea"]
  ];

  for (const [pattern, replacement] of typoMap) {
    text = text.replace(pattern, replacement);
  }

  // Strip punctuation to clean tokens
  return text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Enhanced Intent-Based Rule Engine for Mira (Menstrual Wellness Assistant)
 * Delivers question-specific, evidence-informed guidance across 21+ topics,
 * urgent clinical triage safety checks, and context-sensitive follow-up handling.
 */
function generateMiraResponse(rawQuery) {
  if (!rawQuery || !rawQuery.trim()) {
    return "";
  }

  const clean = normalizeText(rawQuery);

  // Contextual reference resolution (e.g., "how do i stop it", "is that normal", "what else")
  let effective = clean;
  const hasVagueReference = /\b(it|that|this|them|those|that happen|fix it|stop it|treat it|relieve it|is that normal|is it normal|what else|anything else|more tips)\b/.test(clean);
  const hasExplicitTopic = /\b(cramp|bleed|period|cycle|pad|tampon|cup|food|eat|exercise|bloat|headache|back|hygiene|mood|sleep|stress|myth|doctor|fever|pregnant)\b/.test(clean);

  if (hasVagueReference && !hasExplicitTopic && miraSession.lastTopic) {
    effective = `${clean} ${miraSession.lastTopic}`;
  }

  // Question pattern helpers
  const isWhy = /\b(why|what causes|cause of|reason for|what makes|how come)\b/.test(effective);
  const isHow = /\b(how|way to|how do i|how can i|remedy|relieve|stop|reduce|treat|manage|ease|tips|cure|help with|deal with|fix)\b/.test(effective);
  const isDoctor = /\b(doctor|dr|gynecologist|hospital|clinic|evaluat|physician|checkup|visit|see a doctor|consult|red flag|danger|warning sign|emergency)\b/.test(effective);
  const isNormal = /\b(is it normal|is that normal|are severe|is severe|is heavy|is light|am i normal|should it|abnormal|common|normal)\b/.test(effective);
  const isCanShould = /\b(can i|should i|is it safe|is it okay|okay to|allowed to|alright to)\b/.test(effective);

  // Follow-up detection: Only treat as follow-up if it is a bare/vague question WITHOUT a new explicit topic
  const isBareFollowup =
    /\b(what else|tell me more|anything else|more tips|how do i do that|can you explain more|why is that|why does that happen|why so|what about that)\b/.test(clean) ||
    /^(why|how|what else|more|tell me more|anything else)\??$/.test(clean);

  const hasNewTopic = /\b(cramp|bleed|period|cycle|pad|tampon|cup|food|eat|exercise|workout|gym|bloat|headache|migraine|back|hygiene|mood|pms|sleep|stress|myth|doctor|fever|pregnant|delay|late|missed)\b/.test(clean);

  const isFollowup = isBareFollowup && !hasNewTopic;

  // =========================================================================
  // PRIORITY 0: URGENT MEDICAL TRIAGE & CRITICAL SAFETY CHECKS
  // =========================================================================

  // 0A. Severe Hemorrhage / Extreme Bleeding
  if (
    (/\b(soak|soaking|change|fill|filling)\b/.test(effective) && /\b(every hour|each hour|1 hour|one hour|hourly|2 hours|two hours)\b/.test(effective) && /\b(pad|tampon|pads|tampons)\b/.test(effective)) ||
    (/\b(clot|clots)\b/.test(effective) && /\b(large|huge|quarter|golf ball|lemon|fist|big)\b/.test(effective)) ||
    (/\b(bleeding|bleed)\b/.test(effective) && /\b(faint|fainting|dizzy|passed out|pale|breathless|gushing|wont stop)\b/.test(effective))
  ) {
    miraSession.lastTopic = "urgent_bleeding";
    return `🚨 <strong>Urgent Medical Attention Recommended:</strong><br><br>
      Soaking through a sanitary pad or tampon every hour for two or more consecutive hours, passing blood clots larger than a quarter (or golf ball size), or feeling faint, dizzy, or breathless indicates unusually heavy menstrual hemorrhage (severe menorrhagia).<br><br>
      <strong>What to do right now:</strong><br>
      • Please contact your doctor, visit an urgent care clinic, or go to the nearest emergency department immediately.<br>
      • Note how many pads or tampons you have soaked through and the approximate timeline.<br>
      • Rest in a seated or reclining position with your legs slightly elevated, and avoid moving around unattended.<br><br>
      <em>⚠️ Mira is a wellness educational assistant and cannot replace clinical emergency triage. Please prioritize medical care immediately.</em>`;
  }

  // 0B. Toxic Shock Syndrome (TSS) or Acute Infection Red Flags
  if (
    (/\b(tampon|cup|menstrual cup)\b/.test(effective) && /\b(fever|high temp|vomit|vomiting|rash|chills|diarrhea|dizzy|faint)\b/.test(effective)) ||
    (/\b(fever|chills)\b/.test(effective) && /\b(pelvic pain|discharge|smell|foul)\b/.test(effective))
  ) {
    miraSession.lastTopic = "urgent_infection";
    return `🚨 <strong>Urgent Warning – Potential Infection or TSS Risk:</strong><br><br>
      A sudden high fever (above 101°F / 38.3°C), vomiting, diarrhea, dizziness, confusion, or a sunburn-like skin rash while using tampons or a menstrual cup can indicate <strong>Toxic Shock Syndrome (TSS)</strong> or an acute pelvic infection.<br><br>
      <strong>Immediate Actions:</strong><br>
      • <strong>Remove your tampon or menstrual cup immediately</strong> and switch to an external sanitary pad.<br>
      • Seek emergency medical evaluation or call local emergency services without delay.<br>
      • Explicitly inform healthcare staff that you were using a tampon or cup and developed sudden acute symptoms.<br>
      • Do not wait to see if symptoms improve on their own. 🩺`;
  }

  // 0C. Severe Acute / Agonizing Pelvic Pain
  if (
    (/\b(severe|unbearable|excruciating|agonizing|worst|sharp|sudden)\b/.test(effective) && /\b(pain|cramp|cramps|hurt)\b/.test(effective) && /\b(pelvic|tummy|stomach|abdomen|side|lower belly)\b/.test(effective)) ||
    (/\b(pain|cramp)\b/.test(effective) && /\b(vomiting|fainted|cant stand|cant walk|emergency)\b/.test(effective))
  ) {
    miraSession.lastTopic = "urgent_pain";
    return `🚨 <strong>Medical Alert – Severe Pelvic Pain:</strong><br><br>
      Sudden, sharp, debilitating pain—especially if concentrated on one side of your lower abdomen, causing nausea/vomiting, or preventing you from standing—is <strong>not</strong> typical menstrual cramping.<br><br>
      <strong>Important Guidance:</strong><br>
      • This requires prompt medical evaluation to rule out acute conditions such as a ruptured ovarian cyst, ectopic pregnancy, pelvic inflammatory disease, or appendicitis.<br>
      • Please visit an urgent care center or emergency room right away rather than relying on home remedies.<br>
      • Do not take heavy unprescribed medications before a clinical assessment. 🩺`;
  }

  // 0D. Possible Ectopic Pregnancy Warning
  if (
    /\b(pregnant|pregnancy test)\b/.test(effective) &&
    /\b(pain|bleed|bleeding|spotting|sharp|cramp|shoulder)\b/.test(effective)
  ) {
    miraSession.lastTopic = "urgent_pregnancy";
    return `🚨 <strong>Important Pregnancy & Safety Alert:</strong><br><br>
      If you are or might be pregnant and are experiencing vaginal bleeding, sharp pelvic pain, or shoulder-tip discomfort, this could indicate an <strong>ectopic pregnancy</strong> or other early pregnancy complication.<br><br>
      <strong>Immediate Guidance:</strong><br>
      • Please contact your OB/GYN or go to the nearest emergency clinic immediately for an urgent ultrasound and clinical evaluation.<br>
      • Do not wait to see if the symptoms pass. Immediate medical assessment is essential.`;
  }

  // =========================================================================
  // PRIORITY 1: CONTEXT-SENSITIVE FOLLOW-UP QUESTIONS
  // =========================================================================
  if (isFollowup && miraSession.lastTopic) {
    if (miraSession.lastTopic === "cramps") {
      return `🌸 <strong>Additional Comfort Measures for Cramps:</strong><br><br>
        • <strong>Acupressure (SP6 point):</strong> Gently massage the point located about 4 finger-widths above your inner ankle bone behind the shin.<br>
        • <strong>Diaphragmatic breathing:</strong> Place one hand on your belly; take deep belly breaths to gently stretch your internal pelvic diaphragm.<br>
        • <strong>Warm Epsom salt bath:</strong> The magnesium in Epsom salts absorbed through warm water can provide soothing relief.`;
    }
    if (miraSession.lastTopic === "nutrition") {
      return `🥗 <strong>More Nutrition Tips:</strong><br><br>
        • <strong>Turmeric & Cumin:</strong> Adding turmeric and roasted jeera to soups offers natural anti-inflammatory curcumin to calm cramps.<br>
        • <strong>Avoid caffeine on empty stomach:</strong> Coffee raises cortisol and can trigger sudden uterine cramping.<br>
        • <strong>Snack pairing:</strong> Pair a banana with almonds for a synergistic combo of potassium, magnesium, and healthy fats!`;
    }
    if (miraSession.lastTopic === "exercise") {
      return `🧘‍♀️ <strong>More Movement Guidance:</strong><br><br>
        • Always begin with a gentle 3-minute warm-up of slow pelvic circles.<br>
        • Avoid inversions (headstands or shoulder stands) if they make you feel disoriented or uncomfortable.<br>
        • Remember: Even 5 minutes of gentle lying-down stretches counts!`;
    }
    if (miraSession.lastTopic === "late_period" || miraSession.lastTopic === "irregular_cycle") {
      return `🩺 <strong>More Context on Cycle Delays:</strong><br><br>
        • If you recently switched diets, started intense training, or recovered from flu/COVID, your body may have delayed ovulation by a few weeks.<br>
        • The luteal phase between ovulation and your period is almost always 12–14 days. If your period is late, ovulation was delayed earlier in the month!`;
    }
    if (miraSession.lastTopic.startsWith("urgent")) {
      return `🚨 <strong>Emergency Care Reminder:</strong><br><br>
        Because your previous symptoms involve potentially acute complications (such as severe bleeding, intense unilateral pain, or fever with tampons), please do not wait or rely on home tips. Seek immediate medical evaluation at an emergency clinic or with your doctor right away.`;
    }
  }

  // =========================================================================
  // PRIORITY 2: TOPIC-SPECIFIC INTENTS
  // =========================================================================

  // 1. HEADACHES & MENSTRUAL MIGRAINES
  if (/\b(headache|headaches|migraine|migraines|head pain|temple pain|head hurts)\b/.test(effective)) {
    miraSession.lastTopic = "headache";
    if (isWhy) {
      return `🧠 <strong>Why Headaches Happen Around Your Period:</strong><br><br>
        Menstrual headaches and migraines are most commonly triggered by the rapid drop in <strong>estrogen</strong> that occurs right before your period begins.<br><br>
        • When estrogen plunges, blood vessels in the brain can dilate and neurotransmitters like serotonin fluctuate.<br>
        • Prostaglandins circulating in the bloodstream and mild dehydration also contribute to throbbing temple pain.<br><br>
        <em>💡 Comfort tip: Staying well hydrated with electrolytes before your period starts can significantly soften estrogen-drop headaches!</em>`;
    }
    return `💆‍♀️ <strong>Relief for Menstrual Headaches & Migraines:</strong><br><br>
      • <strong>Hydrate with electrolytes:</strong> Sip tender coconut water or room-temperature water with lemon to restore cellular fluid balance.<br>
      • <strong>Quiet, dark rest:</strong> Rest in a cool, dimly lit room with your eyes closed for 20–30 minutes to reduce sensory stimulation.<br>
      • <strong>Temperature therapy:</strong> Apply a cool compress to your forehead or temples, or place a warm pack on the back of your neck to ease muscle tension.<br>
      • <strong>Magnesium support:</strong> A handful of almonds or a small square of dark chocolate (70%+) provides gentle magnesium.<br><br>
      <em>⚠️ Note: If you experience a sudden, explosive headache accompanied by vision loss, weakness, or fever, seek emergency medical care.</em>`;
  }

  // 2. BACK PAIN
  if (/\b(back pain|back ache|backache|lower back|back hurts|spine pain)\b/.test(effective)) {
    miraSession.lastTopic = "back_pain";
    if (isWhy) {
      return `🧘‍♀️ <strong>Why Periods Cause Lower Back Pain:</strong><br><br>
        Lower back pain during your period is caused by the same chemical triggers responsible for uterine cramps: <strong>prostaglandins</strong>.<br><br>
        • The uterus contracts to shed its lining. Because pelvic and lower lumbar nerves share intersecting pathways, these contractions radiate outward into the lower back and upper thighs.<br>
        • Hormonal shifts also cause mild ligament laxity in the pelvis, which can place temporary mechanical strain on your lumbar spine.`;
    }
    return `🌸 <strong>Easing Lower Back Pain During Your Period:</strong><br><br>
      • <strong>Direct heat:</strong> Apply a warm heating pad (approx 40°C) or hot water bottle directly across your lower lumbar area for 15–20 minutes.<br>
      • <strong>Cat-Cow & Child’s Pose:</strong> Gentle spinal flexion on your hands and knees stretches lumbar fascia and relieves deep pelvic compression.<br>
      • <strong>Supportive sleep posture:</strong> Sleep in the fetal position on your side with a firm pillow between your knees to keep your pelvis aligned.<br>
      • <strong>Avoid heavy lifting:</strong> Give your lower spine a break and wear comfortable, supportive flat shoes.<br><br>
      <em>⚠️ Note: If back pain shoots down your leg with tingling/numbness or prevents urination, consult a healthcare provider.</em>`;
  }

  // 3. BLOATING & WATER RETENTION
  if (/\b(bloat|bloating|water retention|puffy|puffiness|swollen belly|gassy|distended)\b/.test(effective)) {
    miraSession.lastTopic = "bloating";
    if (isWhy) {
      return `💧 <strong>What Causes Menstrual Bloating:</strong><br><br>
        Menstrual bloating is primarily driven by progesterone and aldosterone hormones in the late luteal phase:<br><br>
        • <strong>Progesterone surge & drop:</strong> Progesterone relaxes gastrointestinal smooth muscles, slowing down gut motility and leading to gas accumulation and mild constipation.<br>
        • <strong>Aldosterone shift:</strong> Shifts in hormonal balance signal your kidneys to temporarily retain water and sodium, causing that swollen or tight feeling in your lower belly.<br><br>
        <em>Mild bloating of 1–3 pounds before your period is completely normal and typically resolves within the first 2–3 days of bleeding.</em>`;
    }
    return `🥗 <strong>How to Reduce Period Bloating:</strong><br><br>
      • <strong>Hydrate consistently:</strong> Drinking 2–3 liters of water paradoxically signals your kidneys to flush out stored sodium and excess fluid!<br>
      • <strong>Potassium-rich foods:</strong> Bananas, sweet papaya, coconut water, and spinach naturally counterbalance excess sodium.<br>
      • <strong>Soothing warm teas:</strong> Peppermint and ginger teas relax gastrointestinal spasms and help release trapped intestinal gas.<br>
      • <strong>Limit sodium & carbonation:</strong> Temporarily cut back on highly processed salty snacks, chips, and carbonated sodas.<br>
      • <strong>Gentle 15-minute walks:</strong> Light walking stimulates peristalsis and helps your digestive tract move smoothly.`;
  }

  // 4. HEAVY BLEEDING & CLOTS (Menorrhagia)
  if (/\b(heavy period|heavy bleed|heavy bleeding|flooding|blood clot|blood clots|heavy flow|bleeding heavily)\b/.test(effective)) {
    miraSession.lastTopic = "heavy_bleeding";
    if (isDoctor || isNormal) {
      return `🩺 <strong>Is Heavy Bleeding Normal? When to Check:</strong><br><br>
        An average period yields about 30–60 ml (2–4 tablespoons) of blood. While flows vary, here is how to distinguish normal from concerning:<br><br>
        • <strong>Normal variation:</strong> Having 1 or 2 heavier days where you change a pad every 3–4 hours, with small dime-sized clots, is common.<br>
        • <strong>When to seek medical evaluation:</strong><br>
          – Soaking through 1+ pads or tampons every hour for 2 consecutive hours.<br>
          – Passing blood clots larger than a quarter (approx 2.5 cm).<br>
          – Bleeding that persists longer than 7 full days.<br>
          – Feeling lightheaded, chronically fatigued, or breathless (signs of iron deficiency anemia).<br><br>
        <em>Consult a gynecologist to evaluate potential underlying causes like fibroids, adenomyosis, polyps, or thyroid imbalances.</em>`;
    }
    return `🩸 <strong>About Heavy Menstrual Flow:</strong><br><br>
      Heavy bleeding (menorrhagia) occurs when the endometrial lining builds up excessively or when uterine contractions are inefficient at sealing local blood vessels.<br><br>
      • <strong>Nourish iron reserves:</strong> Heavy bleeding depletes hemoglobin. Prioritize iron-rich foods like lentils, spinach, chickpeas, and eggs, paired with vitamin C (lemon juice) to enhance absorption.<br>
      • <strong>Stay well-hydrated:</strong> Drink plenty of water and electrolyte drinks to maintain blood volume and prevent dizziness.<br>
      • <strong>Track your flow:</strong> Note how many pads or tampons you use daily to provide accurate data to your gynecologist.<br><br>
      <em>⚠️ Reminder: If your flow requires changing pads every hour or includes clots larger than a quarter, please seek medical evaluation.</em>`;
  }

  // 5. LIGHT BLEEDING & SPOTTING (Hypomenorrhea)
  if (/\b(light period|light bleed|light bleeding|scanty|spotting|barely bleeding|brown discharge|scant flow)\b/.test(effective)) {
    miraSession.lastTopic = "light_bleeding";
    return `🌸 <strong>Understanding Light Bleeding & Spotting:</strong><br><br>
      Having a very light period (hypomenorrhea) or spotting can happen for several common physiological reasons:<br><br>
      • <strong>Hormonal contraception:</strong> Birth control pills, patches, or hormonal IUDs thin the uterine lining, often making periods very light or stopping them safely.<br>
      • <strong>High stress or rapid weight change:</strong> High cortisol can lead to lower estrogen, resulting in a lighter endometrial buildup.<br>
      • <strong>Perimenopause or early cycle years:</strong> Irregular ovulation during teenage years or in your 40s often causes fluctuating light cycles.<br>
      • <strong>Implantation spotting:</strong> Light pink or brown spotting 10–14 days after conception can sometimes be an early pregnancy sign.<br><br>
      <em>💡 Next step: If sexually active, consider taking a home pregnancy test. If cycles remain unusually scanty without obvious reason, check in with a doctor.</em>`;
  }

  // 6. MISSED OR LATE PERIODS
  if (
    /\b(late period|period late|missed period|period missed|delayed period|period delay|why is my period late|havent got my period|no period|period has not come)\b/.test(effective)
  ) {
    miraSession.lastTopic = "late_period";
    return `⏱️ <strong>Why Is Your Period Late? Common Causes:</strong><br><br>
      A period is considered late when it has been more than 35 days since the start of your last cycle. The most frequent causes include:<br><br>
      • <strong>Emotional or physical stress:</strong> Acute stress elevates cortisol, which signals your hypothalamus to delay or temporarily halt ovulation.<br>
      • <strong>Travel & sleep shifts:</strong> Crossing time zones or irregular sleep schedules disrupts your circadian rhythm and hormonal pulses.<br>
      • <strong>Recent illness or medication:</strong> A viral infection or new medications can temporarily postpone ovulation.<br>
      • <strong>Possible pregnancy:</strong> If you are sexually active, this is always an important consideration.<br>
      • <strong>Hormonal conditions:</strong> PCOS, thyroid fluctuations, or sudden weight shifts.<br><br>
      <strong>Recommended Next Steps:</strong><br>
      1. If sexually active, take an over-the-counter urine pregnancy test using first morning urine.<br>
      2. If negative, rest and track your cycle. If your period is more than 90 days late, schedule a visit with a gynecologist.`;
  }

  // 7. IRREGULAR PERIODS
  if (/\b(irregular|irregular period|irregular periods|unpredictable period|erratic period|cycle irregular)\b/.test(effective)) {
    miraSession.lastTopic = "irregular_cycle";
    return `🩺 <strong>About Irregular Menstrual Cycles:</strong><br><br>
      While a 28-day cycle is often cited in textbooks, normal cycle lengths naturally range between <strong>21 and 35 days</strong>. Having your period arrive 2–4 days earlier or later than usual is completely normal.<br><br>
      <strong>When a cycle is considered clinically irregular:</strong><br>
      • Your cycles are consistently shorter than 21 days or longer than 35 days.<br>
      • Your cycle length varies by more than 7–9 days from month to month.<br>
      • You skip periods for several months at a time.<br><br>
      <strong>Common Causes:</strong> Polycystic Ovary Syndrome (PCOS), thyroid disorders, prolonged stress, significant weight changes, or adolescent hormonal maturation.<br><br>
      <em>💡 Tip: Keep a 3-month log in FloWell noting cycle start dates and symptoms to share with your gynecologist!</em>`;
  }

  // 8. CYCLE LENGTH & PHASES
  if (/\b(cycle length|normal cycle|how long is a cycle|how many days|menstrual cycle length|cycle phases|phases of)\b/.test(effective)) {
    miraSession.lastTopic = "cycle_length";
    return `📅 <strong>Normal Cycle Length & The 4 Cycle Phases:</strong><br><br>
      A healthy menstrual cycle typically lasts between <strong>21 and 35 days</strong> (averaging 28 days). It is counted from **Day 1 of bright red bleeding** up to the day before your next period begins.<br><br>
      <strong>The 4 Phases of Your Cycle:</strong><br>
      1. <strong>Menstrual Phase (Days 1–5):</strong> Estrogen and progesterone are at their lowest; the uterine lining sheds.<br>
      2. <strong>Follicular Phase (Days 1–13):</strong> Estrogen rises, energy rebounds, and an ovarian follicle matures.<br>
      3. <strong>Ovulatory Phase (Around Day 14):</strong> A surge in Luteinizing Hormone (LH) triggers the release of an egg.<br>
      4. <strong>Luteal Phase (Days 15–28):</strong> Progesterone dominates to support the uterine lining. If conception does not occur, hormones drop and trigger the next period.`;
  }

  // 9. MENSTRUAL CRAMPS (Dysmenorrhea)
  if (/\b(cramp|cramps|cramping|dysmenorrhea|period hurt|periods hurt|period pain|painful period|tummy ache)\b/.test(effective)) {
    miraSession.lastTopic = "cramps";

    // Dedicated Heat Therapy Question
    if (/\b(heat|heating pad|hot water bottle|warmth|hot bath)\b/.test(effective)) {
      return `🔥 <strong>How Heat Therapy Relieves Cramps:</strong><br><br>
        • <strong>Relaxes uterine smooth muscles:</strong> Applying heat (approx 40°C) directly dilates local blood vessels and releases muscular constriction in the myometrium.<br>
        • <strong>Blocks pain signals:</strong> Heat stimulates thermoreceptors in the skin, which transmit signals faster than slow pain fibers, effectively closing the "pain gate" at the spinal cord level (gate control theory).<br>
        • <strong>Clinical efficacy:</strong> Studies demonstrate continuous low-level topical heat is as effective as mild ibuprofen for dysmenorrhea, with zero stomach irritation!<br><br>
        <em>Apply a heating pad or hot water bottle to your lower abdomen or lower back for 15–20 minutes.</em>`;
    }

    // Why do cramps happen?
    if (isWhy) {
      return `🌸 <strong>Why Do Periods Hurt? The Science of Cramps:</strong><br><br>
        Menstrual cramps (dysmenorrhea) are caused by natural chemicals called <strong>prostaglandins</strong> produced in the lining of your uterus:<br><br>
        • Before your period starts, the endometrial lining builds up prostaglandins.<br>
        • When bleeding begins, prostaglandins cause the muscular walls of your uterus to contract rhythmically to shed the lining.<br>
        • Higher prostaglandin levels cause tighter contractions, which temporarily compress nearby blood vessels and reduce oxygen supply to the muscle, triggering pain signals.<br><br>
        <em>💡 Good to know: Mild to moderate cramps are very common, but pain that prevents normal daily activities warrants a doctor's evaluation.</em>`;
    }

    // Are severe cramps normal? / Doctor check
    if (isNormal || isDoctor) {
      return `🩺 <strong>Are Severe Cramps Normal?</strong><br><br>
        <strong>Mild to moderate discomfort</strong> that eases with a warm heating pad, gentle rest, or over-the-counter pain relievers is considered a normal part of menstruation.<br><br>
        <strong>Severe, debilitating pain is NOT normal:</strong><br>
        • If your cramps force you to miss work or school, make you vomit, cause you to faint, or fail to respond to medication, you should not silently endure them.<br>
        • Severe dysmenorrhea can be a symptom of conditions like <strong>endometriosis</strong>, <strong>adenomyosis</strong>, or <strong>uterine fibroids</strong>.<br><br>
        <em>Please schedule a consultation with a gynecologist. There are effective, specialized treatment options available.</em>`;
    }

    // How to relieve cramps / comfort measures
    return `🌸 <strong>How to Relieve Period Cramps Safely:</strong><br><br>
      • <strong>Soothing Heat Therapy:</strong> Apply a heating pad or hot water bottle (approx 40°C) across your lower tummy or back. Heat increases pelvic blood flow and relaxes uterine contractions as effectively as mild pain relievers!<br>
      • <strong>Warm Herbal Infusions:</strong> Freshly brewed ginger tea inhibits the inflammatory prostaglandin pathway, while chamomile tea provides antispasmodic muscle relaxation.<br>
      • <strong>Child’s Pose (Balasana):</strong> Kneel, fold your torso forward with your forehead on your mat, and take slow belly breaths to decompress your pelvic floor.<br>
      • <strong>Magnesium Boost:</strong> Snack on pumpkin seeds, almonds, or 1–2 squares of dark chocolate (70%+) to naturally ease muscle spasms.<br>
      • <strong>Gentle Walking:</strong> Light walking encourages your body to release endorphins—nature's built-in pain relievers.`;
  }

  // 10. PMS & MOOD CHANGES
  if (/\b(pms|premenstrual|mood|moody|emotional|crying|cry|sad|irritab|irritated|angry|anxiety|depressed|grumpy)\b/.test(effective)) {
    miraSession.lastTopic = "pms_mood";
    if (isWhy) {
      return `💖 <strong>Why PMS Causes Emotional Shifts:</strong><br><br>
        Emotional changes before your period are biologically driven, not your fault! Here is why they happen:<br><br>
        • In the late luteal phase (the week before bleeding), your body experiences a sharp decline in both <strong>estrogen</strong> and <strong>progesterone</strong>.<br>
        • This rapid hormonal withdrawal causes a temporary drop in <strong>serotonin</strong>—the brain neurotransmitter responsible for feelings of calm, happiness, and emotional stability.<br>
        • Blood sugar fluctuations during this time can also exacerbate irritability and fatigue.`;
    }
    return `💖 <strong>Managing PMS & Mood Swings:</strong><br><br>
      • <strong>Complex carbohydrates:</strong> Whole grains, oats, brown rice, and sweet potatoes help support steady serotonin production and prevent mood crashes.<br>
      • <strong>Prioritize restorative sleep:</strong> Aim for 8 hours of uninterrupted rest; sleep deprivation magnifies emotional sensitivity.<br>
      • <strong>Limit caffeine & alcohol:</strong> Both can amplify irritability, nervousness, and sleep disturbances.<br>
      • <strong>Gentle sunshine & walks:</strong> 15 minutes of daylight walking boosts endorphins and natural serotonin.<br>
      • <strong>Practice self-compassion:</strong> Acknowledge your feelings without judgment. It is completely okay to take things slow today. 🌸`;
  }

  // 11. FATIGUE & LOW ENERGY
  if (/\b(fatigue|tired|tiredness|exhausted|exhaustion|low energy|sluggish|sleepy|no energy|drained)\b/.test(effective)) {
    miraSession.lastTopic = "fatigue";
    return `🌙 <strong>Understanding & Easing Period Fatigue:</strong><br><br>
      Feeling exhausted before or during your period is very common and has clear biological reasons:<br><br>
      • <strong>Hormonal nadir:</strong> Estrogen and progesterone drop to their lowest levels, reducing natural metabolic stimulation.<br>
      • <strong>Iron loss:</strong> Menstrual blood loss temporarily lowers circulating hemoglobin, meaning less oxygen reaches your tissues.<br>
      • <strong>Sleep disruption:</strong> Body temperature shifts and cramping can diminish REM and deep sleep quality.<br><br>
      <strong>How to recharge:</strong><br>
      • Replenish with iron-rich lentils, spinach, chickpeas, and eggs paired with vitamin C.<br>
      • Take a 20-minute afternoon power rest.<br>
      • Stay hydrated with electrolyte-rich water or coconut water.<br>
      • Allow yourself to say "no" to non-essential tasks—rest is productive healing!`;
  }

  // 12. MENSTRUAL HYGIENE
  if (/\b(hygiene|clean|wash|washing|cleanse|smell|odor|vagina clean|vulva)\b/.test(effective)) {
    miraSession.lastTopic = "hygiene";
    return `🚿 <strong>Essential Menstrual Hygiene Guidelines:</strong><br><br>
      • <strong>Wash external vulva with warm water only:</strong> Never wash inside the vagina or use douching products. The vagina is self-cleaning with a delicate acidic pH and healthy lactobacillus bacteria.<br>
      • <strong>Wipe front to back:</strong> Always cleanse from the front (vulva) toward the back (anus) to avoid introducing intestinal bacteria into the urethra or vagina.<br>
      • <strong>Change products regularly:</strong> Replace sanitary pads or tampons every 4 to 8 hours (or empty cups every 8 to 12 hours) to avoid bacterial overgrowth.<br>
      • <strong>Breathable cotton underwear:</strong> Choose 100% cotton panties to ensure airflow and reduce moisture accumulation.<br>
      • <strong>Natural scent awareness:</strong> Mild menstrual odor is completely normal. Strong, foul, or fishy odors, especially with itching or fever, warrant a doctor’s check for bacterial vaginosis.`;
  }

  // 13. PADS, TAMPONS, MENSTRUAL CUPS & TSS
  if (/\b(pad|pads|tampon|tampons|cup|menstrual cup|disc|period underwear|toxic shock|tss)\b/.test(effective)) {
    miraSession.lastTopic = "products";

    // How often to change?
    if (/\b(often|how long|change|hours|frequency|replace)\b/.test(effective)) {
      return `⏱️ <strong>How Often Should You Change Menstrual Products?</strong><br><br>
        • <strong>Sanitary Pads:</strong> Change every <strong>4 to 6 hours</strong> (at most 8 hours), even on light flow days, to maintain freshness and prevent bacterial growth and skin irritation.<br>
        • <strong>Tampons:</strong> Change every <strong>4 to 8 hours</strong>. Never leave a single tampon inserted for more than 8 hours due to the risk of Toxic Shock Syndrome (TSS).<br>
        • <strong>Menstrual Cups / Discs:</strong> Empty, rinse, and reinsert every <strong>8 to 12 hours</strong>. Sterilize in boiling water between cycles.<br>
        • <strong>Period Underwear:</strong> Rinse in cold water and change every 8–12 hours depending on flow absorption level.`;
    }

    // Safety / TSS info
    if (/\b(toxic shock|tss|safe|danger|risk)\b/.test(effective)) {
      return `🛡️ <strong>Tampon Safety & Toxic Shock Syndrome (TSS):</strong><br><br>
        Toxic Shock Syndrome is a rare but life-threatening complication of certain bacterial infections (typically <em>Staphylococcus aureus</em>):<br><br>
        • <strong>Prevention:</strong> Always use the lowest absorbency tampon needed for your flow, change tampons every 4–8 hours, and alternate with pads overnight.<br>
        • <strong>Warning signs:</strong> Sudden high fever (over 101°F / 38.3°C), vomiting, diarrhea, dizziness, fainting, or a sunburn-like rash.<br>
        • <strong>Action:</strong> If you develop these symptoms, remove your tampon immediately and seek emergency medical care.`;
    }

    return `🌸 <strong>Choosing the Right Menstrual Product:</strong><br><br>
      • <strong>Sanitary Pads:</strong> Best for beginners, easy to use, external, and great for overnight sleep.<br>
      • <strong>Tampons:</strong> Internal, discreet, and ideal for swimming or sports. Change every 4–8 hours.<br>
      • <strong>Menstrual Cups:</strong> Eco-friendly, reusable for up to 10 years, hold up to 3x more fluid than a tampon, and safe for up to 12 hours.<br>
      • <strong>Period Underwear:</strong> Comfortable, reusable, and great as standalone protection or backup leak defense.`;
  }

  // 14. PERIOD TRACKING
  if (/\b(track|tracking|tracker|log|logging|record|predict|app)\b/.test(effective)) {
    miraSession.lastTopic = "tracking";
    return `📱 <strong>Why Track Your Menstrual Cycle?</strong><br><br>
      Tracking your period with FloWell gives you invaluable health insights:<br><br>
      • <strong>Predict next period & fertile window:</strong> Knowing when your next period arrives lets you plan work, travel, and activities with confidence.<br>
      • <strong>Identify personal patterns:</strong> Notice which days you experience cramp peaks, energy dips, or mood shifts so you can proactively schedule rest.<br>
      • <strong>Spot irregularities early:</strong> Concrete data helps identify shifts in cycle length or unexpected spotting.<br>
      • <strong>Doctor consultations:</strong> Gynecologists love having exact dates, cycle lengths, and symptom logs when diagnosing issues.`;
  }

  // 15. EXERCISE & MOVEMENT
  if (/\b(exercise|workout|gym|yoga|walk|walking|movement|stretching|run|running|swim|swimming|pilates|train|training)\b/.test(effective)) {
    miraSession.lastTopic = "exercise";

    if (isCanShould || /\b(safe|okay|good|allowed)\b/.test(effective)) {
      return `🧘‍♀️ <strong>Can You Exercise During Your Period?</strong><br><br>
        <strong>Yes, absolutely!</strong> Gentle movement is not only safe, but it is one of the most effective natural ways to reduce menstrual cramps and boost mood.<br><br>
        • <strong>Releases endorphins:</strong> Exercise stimulates natural pain-blocking endorphins that soothe uterine cramping.<br>
        • <strong>Reduces pelvic congestion:</strong> Movement improves circulation and relieves fluid pressure in the pelvic basin.<br>
        • <strong>Lifts PMS blues:</strong> Physical activity boosts brain dopamine and serotonin levels.`;
    }

    return `🧘‍♀️ <strong>Best Exercises for Menstrual Comfort:</strong><br><br>
      • <strong>Restorative Yoga:</strong> Poses like Child’s Pose, Cat-Cow, and Reclined Bound Angle decompress pelvic tension.<br>
      • <strong>Gentle 20-Minute Walking:</strong> Light aerobic walking promotes healthy circulation without taxing your adrenals.<br>
      • <strong>Light Swimming:</strong> Water buoyancy unweights your pelvic floor (use a tampon or cup).<br>
      • <strong>What to avoid on heavy days:</strong> Heavy maximal lifting, intense HIIT, or exhausting endurance workouts if you feel drained.<br><br>
      <em>Listen to your body today—movement is optional, and resting is completely valid!</em>`;
  }

  // 16. FOODS & NUTRITION
  if (/\b(food|foods|eat|eating|nutrition|diet|snack|snacks|meal|meals|chocolate|what should i eat|nutrient)\b/.test(effective)) {
    miraSession.lastTopic = "nutrition";
    return `🥗 <strong>Nourishing Foods for Period Comfort:</strong><br><br>
      • <strong>Iron-Rich Replenishers:</strong> Spinach, fenugreek greens (methi), moong dal, chickpeas, rajma, and boiled eggs restore iron lost through bleeding. (Add lemon juice—vitamin C doubles plant iron absorption!)<br>
      • <strong>Magnesium Champions:</strong> Dark chocolate (70%+), pumpkin seeds, and almonds relax contracted uterine muscle fibers.<br>
      • <strong>Digestive Comfort Meals:</strong> Warm vegetable moong dal khichdi with a teaspoon of pure A2 desi ghee is deeply soothing and gentle on digestion.<br>
      • <strong>Potassium Foods:</strong> Bananas and ripe papaya naturally flush excess sodium to combat bloating.<br>
      • <strong>What to limit:</strong> Excess caffeine and salty fried snacks, which can constrict blood vessels and amplify cramps.`;
  }

  // 17. HYDRATION & TEAS
  if (/\b(hydration|hydrate|water|drink|drinking|fluids|tea|coconut water|ginger tea|chamomile)\b/.test(effective)) {
    miraSession.lastTopic = "hydration";
    return `🫖 <strong>Hydration & Soothing Beverages:</strong><br><br>
      • <strong>Tender Coconut Water:</strong> Naturally rich in potassium and bioavailable magnesium to replenish minerals and ease dehydration headaches.<br>
      • <strong>Warm Ginger & Tulsi Tea:</strong> Fresh ginger inhibits the inflammatory COX-2 pathway, helping calm cramp spasms naturally.<br>
      • <strong>Chamomile & Peppermint Tea:</strong> Chamomile provides apigenin for restful sleep, while peppermint menthol relaxes gastrointestinal smooth muscles.<br>
      • <strong>Water (2–3 Liters):</strong> Proper hydration paradoxically prompts kidneys to release stored fluid, relieving menstrual puffiness!`;
  }

  // 18. SLEEP & REST
  if (/\b(sleep|sleeping|insomnia|bedtime|rest|sleep position|positions to sleep)\b/.test(effective)) {
    miraSession.lastTopic = "sleep";
    return `🌙 <strong>Restorative Sleep & Optimal Positions for Period Cramps:</strong><br><br>
      • <strong>The Fetal Position:</strong> Sleeping curled on your side with knees gently drawn toward your chest naturally relaxes your abdominal wall muscles and relieves cramp strain.<br>
      • <strong>Side-Sleeping with Knee Pillow:</strong> Placing a pillow between your knees keeps your hips, pelvis, and lumbar spine in neutral alignment.<br>
      • <strong>Avoid sleeping flat on your stomach:</strong> Stomach sleeping can press directly on a tender uterus and strain the lower back.<br>
      • <strong>Cool bedroom environment:</strong> Progesterone shifts can slightly raise basal body temperature; keeping your room cool supports uninterrupted deep sleep.`;
  }

  // 19. STRESS & PERIOD CONNECTION
  if (/\b(stress|stressed|anxious|anxiety|cortisol|nervous|worry)\b/.test(effective)) {
    miraSession.lastTopic = "stress";
    return `🌿 <strong>How Stress Directly Impacts Your Period:</strong><br><br>
      Your brain and reproductive system are intimately linked through the <strong>Hypothalamic-Pituitary-Ovarian (HPO) axis</strong>:<br><br>
      • When you experience prolonged stress, your adrenal glands produce elevated <strong>cortisol</strong>.<br>
      • High cortisol signals the hypothalamus to down-regulate Gonadotropin-Releasing Hormone (GnRH), which can delay ovulation or temporarily halt it entirely.<br>
      • This is why exam stress, relationship anxiety, or work pressure frequently makes periods late or missed.<br><br>
      <em>💡 Practice 4-7-8 breathing: Inhale for 4 seconds, hold for 7 seconds, exhale for 8 seconds to activate your calming parasympathetic nervous system.</em>`;
  }

  // 20. COMMON MENSTRUAL HEALTH MYTHS
  if (/\b(myth|myths|true or false|is it true that|sour food|dirty blood|wash hair|touch pickle)\b/.test(effective)) {
    miraSession.lastTopic = "myths";
    return `✨ <strong>Busting Common Menstrual Health Myths:</strong><br><br>
      • <strong>Myth 1: "Period blood is dirty or toxic."</strong><br>
        <em>Fact:</em> Period blood is completely natural tissue, mucus, and blood shed from the sterile uterine lining. It is not toxic.<br><br>
      • <strong>Myth 2: "Eating sour food (lemon/curd) stops or ruins your period."</strong><br>
        <em>Fact:</em> Digestive foods stay in your GI tract and have zero chemical effect on uterine shedding. Curd actually provides beneficial probiotics!<br><br>
      • <strong>Myth 3: "You shouldn't exercise or wash your hair during your period."</strong><br>
        <em>Fact:</em> Warm showers and gentle movement relieve muscle tension and improve wellbeing.<br><br>
      • <strong>Myth 4: "Every normal cycle is exactly 28 days."</strong><br>
        <em>Fact:</em> Anything between 21 and 35 days is completely healthy and normal!`;
  }

  // 21. WHEN TO SEEK MEDICAL HELP (DOCTOR RED FLAGS)
  if (isDoctor || /\b(see a doctor|consult a doctor|visit doctor|hospital|red flag|warning sign|abnormal period|when should i worry)\b/.test(effective)) {
    miraSession.lastTopic = "doctor_red_flags";
    return `🩺 <strong>When to Consult a Healthcare Provider:</strong><br><br>
      While menstrual fluctuations are common, please schedule a clinical evaluation if you experience:<br><br>
      1. <strong>Excessive Bleeding:</strong> Soaking 1+ pads or tampons every hour for 2 consecutive hours, or passing clots larger than a quarter.<br>
      2. <strong>Debilitating Pain:</strong> Cramps that resist pain relievers and prevent you from going to work, school, or getting out of bed.<br>
      3. <strong>Irregular or Absent Cycles:</strong> Missing your period for 90+ days (when not pregnant), or cycles consistently under 21 or over 35 days.<br>
      4. <strong>Prolonged Bleeding:</strong> Periods lasting longer than 7 full days.<br>
      5. <strong>Intermenstrual Bleeding:</strong> Bleeding or heavy spotting between periods or after intercourse.<br>
      6. <strong>Signs of Infection:</strong> Fever, chills, foul-smelling discharge, or sudden rash while using tampons.`;
  }

  // =========================================================================
  // PRIORITY 3: GREETINGS & INTRODUCTIONS
  // =========================================================================
  if (/\b(hello|hi|hey|greetings|good morning|good afternoon|good evening|who are you|what can you do|about you|sakhi|mira)\b/.test(effective)) {
    return `Hi there! 🌸 I’m <strong>Mira</strong>, your rule-based menstrual wellness assistant on FloWell.<br><br>
      I’m here to offer research-informed guidance on cramp relief, cycle phases, nourishing foods, gentle exercises, and period hygiene.<br><br>
      <em>Feel free to ask questions like:</em><br>
      • "Why do periods hurt?"<br>
      • "How can I relieve cramps?"<br>
      • "What should I eat during my period?"<br>
      • "Can I exercise during menstruation?"<br>
      • "Why is my period late?"`;
  }

  // =========================================================================
  // PRIORITY 4: INTELLIGENT MULTI-VARIATION FALLBACK
  // =========================================================================
  const fallbacks = [
    `💬 I want to make sure I give you accurate, helpful guidance! As a rule-based menstrual wellness assistant, I specialize in period health, cramp relief, cycle tracking, nutrition, exercises, and hygiene.<br><br>
     Could you try rephrasing your question, or tap one of these common topics?<br>
     • <button type="button" class="chip-btn" onclick="sendQuickPrompt('How can I relieve cramps?')">🌸 Cramp Relief</button>
     • <button type="button" class="chip-btn" onclick="sendQuickPrompt('What should I eat during my period?')">🥗 Nutrition</button>
     • <button type="button" class="chip-btn" onclick="sendQuickPrompt('Can I exercise during menstruation?')">🧘‍♀️ Exercise</button>
     • <button type="button" class="chip-btn" onclick="sendQuickPrompt('When should I see a doctor?')">🩺 Doctor Advice</button>`,

    `🌸 I didn't quite catch that phrasing! I'm trained on menstrual wellness, cycle phases, PMS, hygiene, and comfort tips.<br><br>
     Could you clarify what you'd like to know? Here are a few things you can ask me:<br>
     • <em>"Why do periods hurt?"</em><br>
     • <em>"Why is my period late?"</em><br>
     • <em>"How often should I change my pad?"</em><br>
     • <em>"What causes bloating?"</em>`,

    `💬 That's a unique question! As FloWell's rule-based menstrual wellness assistant, I focus specifically on period health, cramps, nutrition, and self-care.<br><br>
     If you're asking about a medical symptom, remember that severe pain or unusual heavy bleeding should always be evaluated by a healthcare provider. How else can I help with your cycle today?`
  ];

  const reply = fallbacks[miraSession.fallbackIndex % fallbacks.length];
  miraSession.fallbackIndex++;
  return reply;
}

// Backwards compatibility alias
const generateSakhiResponse = generateMiraResponse;

// ============================================================================
// 5. INITIALIZATION & EVENT LISTENERS
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initUserSession();

  // Auto-render history if on dashboard with #history element
  if (document.getElementById("history")) {
    if (typeof waitForFirebase === "function") {
      waitForFirebase().then((fb) => {
        if (fb && fb.auth) {
          fb.onAuthStateChanged(fb.auth, (user) => {
            if (user || (typeof isDemoSessionActive === "function" && isDemoSessionActive())) {
              viewHistory();
            }
          });
        }
      });
    } else if (typeof isDemoSessionActive === "function" && isDemoSessionActive()) {
      viewHistory();
    }
  }

  // Allow pressing Enter key to send message in Mira chatbox
  const userInput = document.getElementById("userInput");
  if (userInput) {
    userInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }
});

// Attach to window namespace for inline event handlers (onsubmit, onclick)
if (typeof window !== "undefined") {
  window.calculatePeriod = calculatePeriod;
  window.saveHistory = saveHistory;
  window.viewHistory = viewHistory;
  window.clearHistory = clearHistory;
  window.validateCycleInputs = validateCycleInputs;
  window.openAvatarModal = openAvatarModal;
  window.closeAvatarModal = closeAvatarModal;
  window.handleModalBackdropClick = handleModalBackdropClick;
  window.selectDashboardAvatar = selectDashboardAvatar;
  window.sendQuickPrompt = sendQuickPrompt;
  window.sendMessage = sendMessage;
}
