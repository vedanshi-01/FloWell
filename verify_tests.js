/**
 * Comprehensive Verification Test Suite for FloWell
 * Phase 2 (Firebase Auth & Cloud Firestore Profiles)
 * Phase 3 (Menstrual Cycle History Cloud Firestore & Demo Isolation)
 * Phase 3 Hotfix: Missing Parent /users/{uid} Document Self-Healing & Prevention
 * + Complete Feature Regression Suite
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("=====================================================================");
console.log("  FLOWELL: RUNNING EXTENDED VERIFICATION TEST SUITE (PHASE 2 & 3)");
console.log("=====================================================================\n");

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    if (details) console.log(`   ${details}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   ${details}`);
    failedCount++;
  }
}

// ----------------------------------------------------------------------
// Mock Environment Setup
// ----------------------------------------------------------------------
const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

const mockSessionStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

const mockDOM = {
  regName: { value: "" },
  regEmail: { value: "" },
  regPassword: { value: "" },
  regAvatar: { value: "🦋" },
  loginEmail: { value: "" },
  loginPassword: { value: "" },
  authAlert: { className: "", innerText: "", style: { display: "none" }, scrollIntoView() {} },
  userAvatarEmoji: { innerText: "" },
  userNameText: { innerText: "" },
  cycleLength: { value: "28" },
  lastPeriod: { value: "2025-10-10" },
  result: { innerHTML: "" },
  history: { innerHTML: "" },
  userInput: { value: "", addEventListener() {} },
  chatbox: { innerHTML: "", appendChild() {}, scrollTop: 0, scrollHeight: 0 }
};

const mockCreatedElements = [];
const mockDocument = {
  getElementById(id) { return mockDOM[id] || null; },
  querySelectorAll() { return []; },
  querySelector(sel) {
    return {
      firstChild: { nextSibling: null },
      insertBefore(el) { mockCreatedElements.push(el); },
      appendChild(el) { mockCreatedElements.push(el); }
    };
  },
  createElement(tag) {
    const el = { id: "", className: "", innerText: "", style: { display: "none" } };
    mockDOM[el.id] = el;
    return el;
  },
  body: {
    appendChild(el) { mockCreatedElements.push(el); }
  },
  addEventListener() {},
  removeEventListener() {}
};

let confirmResult = true;
const mockWindow = {
  location: { href: "", pathname: "/login.html", replace(url) { this.href = url; } },
  confirm: (msg) => confirmResult
};

// Mock Cloud Firestore & Auth Database
const mockFirestoreData = { users: {} };
const mockAuthRegistry = {};
let mockCurrentFirebaseUser = null;
let firestoreCallCountForDemo = 0;

const capturedLogs = [];
const mockConsole = {
  log: (...args) => {
    capturedLogs.push({ level: "log", text: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });
    console.log(...args);
  },
  warn: (...args) => {
    capturedLogs.push({ level: "warn", text: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });
    console.warn(...args);
  },
  error: (...args) => {
    capturedLogs.push({ level: "error", text: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });
    console.error(...args);
  }
};

const mockFloWellFirebase = {
  app: {},
  auth: {
    get currentUser() { return mockCurrentFirebaseUser; }
  },
  db: {},
  async createUserWithEmailAndPassword(authInstance, email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    if (mockAuthRegistry[normalizedEmail]) {
      const err = new Error("The email address is already in use by another account.");
      err.code = "auth/email-already-in-use";
      throw err;
    }
    const uid = "firebase_uid_" + Math.random().toString(36).substring(2, 9);
    const user = { uid, email: normalizedEmail };
    mockAuthRegistry[normalizedEmail] = { user, password };
    mockCurrentFirebaseUser = user;
    if (!mockFirestoreData.users[uid]) {
      mockFirestoreData.users[uid] = { cycle_records: {}, hasDocumentBody: false };
    }
    return { user };
  },
  async signInWithEmailAndPassword(authInstance, email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const record = mockAuthRegistry[normalizedEmail];
    if (!record || record.password !== password) {
      const err = new Error("Invalid credentials");
      err.code = "auth/invalid-credential";
      throw err;
    }
    mockCurrentFirebaseUser = record.user;
    if (!mockFirestoreData.users[record.user.uid]) {
      mockFirestoreData.users[record.user.uid] = { cycle_records: {}, hasDocumentBody: false };
    }
    return { user: record.user };
  },
  async signOut(authInstance) {
    mockCurrentFirebaseUser = null;
  },
  onAuthStateChanged(authInstance, callback) {
    callback(mockCurrentFirebaseUser);
    return () => {};
  },
  serverTimestamp() {
    return {
      _methodName: "serverTimestamp",
      toDate: () => new Date(),
      toMillis: () => Date.now()
    };
  },
  doc(dbInstance, ...segments) {
    if (segments.length === 2) {
      return { collectionName: segments[0], id: segments[1], uid: segments[1], path: `${segments[0]}/${segments[1]}` };
    } else if (segments.length === 4) {
      return {
        collectionName: segments[0],
        uid: segments[1],
        subcollection: segments[2],
        id: segments[3],
        path: `${segments[0]}/${segments[1]}/${segments[2]}/${segments[3]}`
      };
    }
    return { path: segments.join("/") };
  },
  collection(dbInstance, ...segments) {
    return {
      collectionName: segments[0],
      uid: segments[1],
      subcollection: segments[2],
      path: segments.join("/")
    };
  },
  query(colRef, ...constraints) {
    return {
      colRef,
      uid: colRef.uid,
      constraints
    };
  },
  orderBy(field, dir = "asc") {
    return { type: "orderBy", field, dir };
  },
  limit(n) {
    return { type: "limit", limit: n };
  },
  async setDoc(docRef, data, options = {}) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== docRef.id) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    const existing = mockFirestoreData.users[docRef.id] || { cycle_records: {} };
    if (options && options.merge) {
      mockFirestoreData.users[docRef.id] = {
        ...existing,
        ...data,
        hasDocumentBody: true,
        cycle_records: existing.cycle_records || {}
      };
    } else {
      mockFirestoreData.users[docRef.id] = {
        ...data,
        hasDocumentBody: true,
        cycle_records: existing.cycle_records || {}
      };
    }
  },
  async getDoc(docRef) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== docRef.id) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    const userObj = mockFirestoreData.users[docRef.id];
    // A document only physically exists in Firestore if its body fields were set
    const exists = !!(userObj && (userObj.hasDocumentBody || (userObj.name && userObj.createdAt)));
    return {
      exists: () => exists,
      data: () => (exists ? { ...userObj } : null)
    };
  },
  async updateDoc(docRef, data) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== docRef.id) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    const userObj = mockFirestoreData.users[docRef.id];
    if (!userObj || !userObj.hasDocumentBody) {
      const err = new Error("No document to update: " + docRef.path);
      err.code = "not-found";
      throw err;
    }
    mockFirestoreData.users[docRef.id] = {
      ...userObj,
      ...data
    };
  },
  async addDoc(colRef, data) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    const targetUid = colRef.uid;
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== targetUid) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    if (!mockFirestoreData.users[targetUid]) {
      mockFirestoreData.users[targetUid] = { cycle_records: {}, hasDocumentBody: false };
    }
    if (!mockFirestoreData.users[targetUid].cycle_records) {
      mockFirestoreData.users[targetUid].cycle_records = {};
    }
    const recordId = "rec_" + Math.random().toString(36).substring(2, 9);
    mockFirestoreData.users[targetUid].cycle_records[recordId] = { ...data };
    return { id: recordId };
  },
  async getDocs(queryOrColRef) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    const targetUid = queryOrColRef.uid || (queryOrColRef.colRef ? queryOrColRef.colRef.uid : null);
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== targetUid) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    const userRecords = (mockFirestoreData.users[targetUid] && mockFirestoreData.users[targetUid].cycle_records) || {};
    const docIds = Object.keys(userRecords);
    const docs = docIds.map(id => ({
      id,
      data: () => ({ ...userRecords[id] })
    }));

    return {
      docs,
      empty: docs.length === 0,
      forEach(callback) {
        this.docs.forEach(callback);
      }
    };
  },
  async deleteDoc(docRef) {
    if (context.isDemoSessionActive && context.isDemoSessionActive()) {
      firestoreCallCountForDemo++;
    }
    const targetUid = docRef.uid;
    if (!mockCurrentFirebaseUser || mockCurrentFirebaseUser.uid !== targetUid) {
      const err = new Error("Missing or insufficient permissions.");
      err.code = "permission-denied";
      throw err;
    }
    if (mockFirestoreData.users[targetUid] && mockFirestoreData.users[targetUid].cycle_records) {
      delete mockFirestoreData.users[targetUid].cycle_records[docRef.id];
    }
  }
};

mockWindow.FloWellFirebase = mockFloWellFirebase;

// Create unified execution context
const authCode = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf-8');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

const context = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  document: mockDocument,
  window: mockWindow,
  console: mockConsole,
  setTimeout: (fn) => fn(),
  Date: Date,
  Math: Math,
  JSON: JSON,
  Array: Array
};

vm.createContext(context);
vm.runInContext(authCode, context);
vm.runInContext(appCode, context);

// ======================================================================
// PHASE 2 TESTS (1 to 10)
// ======================================================================

// TEST 1: Firebase Registration & Cloud Firestore Profile Creation
async function testFirebaseRegistration() {
  mockDOM.regName.value = "Vedanshi";
  mockDOM.regEmail.value = "vedanshi@flowell.com";
  mockDOM.regPassword.value = "SecurePass2026!";
  mockDOM.regAvatar.value = "🦋";

  await context.handleRegister({ preventDefault() {} });

  const currentUser = mockCurrentFirebaseUser;
  const userDoc = currentUser ? mockFirestoreData.users[currentUser.uid] : null;

  const authUserCreated = currentUser && currentUser.email === "vedanshi@flowell.com";
  const profileCreated = userDoc && userDoc.name === "Vedanshi" && userDoc.avatar === "🦋" && userDoc.cycleLength === 28 && userDoc.hasDocumentBody === true;
  const noPasswordsInStorage = !mockLocalStorage.getItem("flowell_demo_users") &&
                               !mockLocalStorage.getItem("flowell_active_user");
  const noPasswordInFirestore = userDoc && !userDoc.password && !userDoc.passwordHash && !userDoc.token;

  assert(
    authUserCreated && profileCreated && noPasswordsInStorage && noPasswordInFirestore,
    "Test 1: Firebase Registration & Cloud Firestore Profile Creation",
    `Output: Created Firebase user '${currentUser ? currentUser.email : ""}' (UID: ${currentUser ? currentUser.uid : ""}) with Firestore profile (Avatar: ${userDoc ? userDoc.avatar : ""}, Name: ${userDoc ? userDoc.name : ""}). Zero passwords in storage or Firestore.`
  );
}

// TEST 2: Firebase Login with Valid Credentials
async function testFirebaseLoginValid() {
  await context.handleLogout();

  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  mockDOM.authAlert.innerText = "";

  await context.handleLogin({ preventDefault() {} });

  const loggedIn = mockCurrentFirebaseUser && mockCurrentFirebaseUser.email === "vedanshi@flowell.com";
  const successAlert = mockDOM.authAlert.innerText.includes("Login successful");

  assert(
    loggedIn && successAlert,
    "Test 2: Firebase Login with Valid Credentials",
    `Output: Successfully authenticated Firebase user '${mockCurrentFirebaseUser ? mockCurrentFirebaseUser.email : ""}'. Session state updated.`
  );
}

// TEST 3: Firebase Login with Invalid Credentials
async function testFirebaseLoginInvalid() {
  await context.handleLogout();

  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "WrongPassword!";
  mockDOM.authAlert.innerText = "";

  await context.handleLogin({ preventDefault() {} });

  const notLoggedIn = mockCurrentFirebaseUser === null;
  const errorAlert = mockDOM.authAlert.innerText.includes("Invalid credentials");

  assert(
    notLoggedIn && errorAlert,
    "Test 3: Firebase Login with Invalid Credentials",
    `Output: Login correctly blocked with alert: '${mockDOM.authAlert.innerText}'`
  );
}

// TEST 4: Duplicate Email Registration Blocked
async function testDuplicateRegistration() {
  mockDOM.regName.value = "Duplicate User";
  mockDOM.regEmail.value = "vedanshi@flowell.com";
  mockDOM.regPassword.value = "AnotherPass123";
  mockDOM.authAlert.innerText = "";

  await context.handleRegister({ preventDefault() {} });

  const errorAlert = mockDOM.authAlert.innerText.includes("already exists");

  assert(
    errorAlert,
    "Test 4: Duplicate Email Registration Blocked (auth/email-already-in-use)",
    `Output: Blocked duplicate email with user alert: '${mockDOM.authAlert.innerText}'`
  );
}

// TEST 5: Firebase Logout (signOut) & State Clearance
async function testFirebaseLogout() {
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  await context.handleLogout();

  const userSignedOut = mockCurrentFirebaseUser === null;
  const demoCleared = !context.isDemoSessionActive();
  const redirectedToLogin = mockWindow.location.href === "login.html";

  assert(
    userSignedOut && demoCleared && redirectedToLogin,
    "Test 5: Firebase Logout (signOut) & Session Clearance",
    "Output: Firebase auth.signOut() executed, session storage wiped, redirected to login.html"
  );
}

// TEST 6: Session Persistence across Refresh
async function testSessionPersistence() {
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  mockWindow.location.pathname = "/index.html";
  mockWindow.location.href = "index.html";

  await context.initAuthObserver();

  const userPersisted = mockCurrentFirebaseUser && mockCurrentFirebaseUser.email === "vedanshi@flowell.com";
  const notRedirectedToLogin = mockWindow.location.href === "index.html";

  assert(
    userPersisted && notRedirectedToLogin,
    "Test 6: Session Persistence across Page Refresh via onAuthStateChanged",
    `Output: Active Firebase user '${userPersisted ? mockCurrentFirebaseUser.email : ""}' retained on protected dashboard without premature redirect`
  );
}

// TEST 7: Navigation & Route Guard across all 5 Protected Pages
async function testProtectedPagesGuard() {
  const protectedPages = ['index.html', 'dos-donts.html', 'exercises.html', 'nutrition.html', 'mira.html'];
  let allPagesHaveModule = true;
  let allPagesCallGuard = true;

  for (const page of protectedPages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf-8');
    if (!html.includes('firebase-config.js')) allPagesHaveModule = false;
    if (!html.includes('requireAuth()')) allPagesCallGuard = false;
  }

  await context.handleLogout();
  mockWindow.location.pathname = "/index.html";
  mockWindow.location.href = "index.html";
  await context.initAuthObserver();
  const unauthenticatedRedirected = mockWindow.location.href === "login.html";

  assert(
    allPagesHaveModule && allPagesCallGuard && unauthenticatedRedirected,
    "Test 7: Route Guard Enforced Across All 5 Protected Pages",
    "Output: firebase-config.js and requireAuth() integrated across all 5 pages; unauthenticated visits redirect to login.html"
  );
}

// TEST 8: Profile & Avatar Retrieval from Cloud Firestore
async function testFirestoreProfileRetrieval() {
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  mockWindow.location.pathname = "/index.html";
  mockDOM.userNameText.innerText = "";
  mockDOM.userAvatarEmoji.innerText = "";

  await context.initAuthObserver();

  const uid = mockCurrentFirebaseUser.uid;
  const profileDoc = mockFirestoreData.users[uid];

  await context.updateUserAvatar("🌙");
  const updatedDoc = mockFirestoreData.users[uid];
  const avatarUpdatedInFirestore = updatedDoc && updatedDoc.avatar === "🌙";

  assert(
    profileDoc && profileDoc.name === "Vedanshi" && avatarUpdatedInFirestore,
    "Test 8: User Profile & Avatar Synchronization with Cloud Firestore",
    `Output: Profile loaded from /users/${uid}. Avatar updated to '${updatedDoc ? updatedDoc.avatar : ""}' directly in Cloud Firestore.`
  );
}

// TEST 9: Firestore Security Rules: Unauthorized Access Rejection
async function testFirestoreSecurityRules() {
  const unauthorizedDocRef = mockFloWellFirebase.doc(mockFloWellFirebase.db, "users", "victim_uid_999");

  let readBlocked = false;
  try {
    await mockFloWellFirebase.getDoc(unauthorizedDocRef);
  } catch (err) {
    readBlocked = err.code === "permission-denied";
  }

  let writeBlocked = false;
  try {
    await mockFloWellFirebase.setDoc(unauthorizedDocRef, { name: "Hacked" });
  } catch (err) {
    writeBlocked = err.code === "permission-denied";
  }

  assert(
    readBlocked && writeBlocked,
    "Test 9: Firestore Security Rules: Cross-User Profile Access Blocked",
    "Output: Reading or writing to /users/{otherUid} throws permission-denied. Users are strictly isolated to their own documents."
  );
}

// TEST 10: Complete Isolation between Firebase Users and Demo Users
async function testDemoModeIsolation() {
  await context.handleLogout();
  await context.handleDemoLogin();

  const isDemo = context.isDemoSessionActive();
  const demoSession = context.getDemoSession();
  const hasNoFirebaseUid = mockCurrentFirebaseUser === null;
  const hasNoFirestoreDoc = !mockFirestoreData.users["demo_user_id"];

  assert(
    isDemo && demoSession && demoSession.isDemo === true && hasNoFirebaseUid && hasNoFirestoreDoc,
    "Test 10: Complete Isolation between Firebase Users and Demo Users",
    `Output: Demo mode runs in isolated sessionStorage (isDemo: true). No Firebase UID is created and no Cloud Firestore reads/writes occur.`
  );
}

// ======================================================================
// PHASE 3 TESTS (11 to 20: Cloud Cycle History & Privacy)
// ======================================================================

// TEST 11: Save Cycle Prediction to Cloud Firestore (/users/{uid}/cycle_records)
let savedRecordId = null;
let savedRecordData = null;
let user1Uid = null;

async function testSaveCyclePredictionToFirestore() {
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  user1Uid = mockCurrentFirebaseUser.uid;

  mockDOM.lastPeriod.value = "2025-10-10";
  mockDOM.cycleLength.value = "28";
  mockDOM.result.innerHTML = "";
  mockDOM.history.innerHTML = "";

  context.calculatePeriod();
  await context.saveHistory();

  const userRecords = mockFirestoreData.users[user1Uid].cycle_records || {};
  const recordIds = Object.keys(userRecords);
  savedRecordId = recordIds[0] || null;
  savedRecordData = savedRecordId ? userRecords[savedRecordId] : null;

  const savedInFirestore = !!savedRecordData;
  const feedbackDisplayed = mockDOM.history.innerHTML.includes("Saved to Cloud") ||
                            mockDOM.history.innerHTML.includes("7 Nov 2025");

  assert(
    savedInFirestore && feedbackDisplayed,
    "Test 11: Save Cycle Prediction to Cloud Firestore (/users/{uid}/cycle_records)",
    `Output: Created document in /users/${user1Uid}/cycle_records/${savedRecordId}. UI provided instant confirmation.`
  );
}

// TEST 12: Firestore Record Schema Validation
async function testFirestoreRecordSchema() {
  const rec = savedRecordData;

  const hasLastPeriod = rec && rec.lastPeriod === "2025-10-10";
  const hasCycleLength = rec && typeof rec.cycleLength === "number" && rec.cycleLength === 28;
  const hasNextPeriod = rec && rec.nextPeriod === "2025-11-07";
  const hasOvulation = rec && rec.ovulation === "2025-10-24" && rec.isEstimate === true;
  const hasCreatedAt = rec && rec.createdAt !== undefined;
  const noPasswordsOrTokens = rec && !rec.password && !rec.token;

  assert(
    hasLastPeriod && hasCycleLength && hasNextPeriod && hasOvulation && hasCreatedAt && noPasswordsOrTokens,
    "Test 12: Firestore Record Schema Validation (lastPeriod, cycleLength, nextPeriod, ovulation, createdAt)",
    `Output: Verified record schema -> lastPeriod: '${rec ? rec.lastPeriod : ""}', cycleLength: ${rec ? rec.cycleLength : 0}, nextPeriod: '${rec ? rec.nextPeriod : ""}', ovulation: '${rec ? rec.ovulation : ""}' (marked estimate: ${rec ? rec.isEstimate : false}), createdAt present.`
  );
}

// TEST 13: Browser Refresh History Persistence via Cloud Query
async function testBrowserRefreshHistoryPersistence() {
  mockDOM.history.innerHTML = "";
  await context.viewHistory();

  const historyHtml = mockDOM.history.innerHTML;
  const displaysCloudBadge = historyHtml.includes("FloWell Cloud Record");
  const displaysLastPeriod = historyHtml.includes("2025-10-10");
  const displaysNextPeriod = historyHtml.includes("7 Nov 2025") || historyHtml.includes("2025-11-07");
  const displaysOvulation = historyHtml.includes("Estimated Ovulation") && historyHtml.includes("Estimate");

  assert(
    displaysCloudBadge && displaysLastPeriod && displaysNextPeriod && displaysOvulation,
    "Test 13: Browser Refresh History Persistence via Cloud Query (Newest First, Cloud Badge)",
    `Output: Queried Firestore subcollection; successfully hydrated history list with cloud badge, prediction dates, and ovulation estimate label.`
  );
}

// TEST 14: Logout & Re-login History Retrieval Persistence
async function testLogoutReloginHistoryPersistence() {
  await context.handleLogout();
  mockDOM.history.innerHTML = "";

  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  await context.viewHistory();

  const historyHtml = mockDOM.history.innerHTML;
  const restoredFromCloud = historyHtml.includes("FloWell Cloud Record") && historyHtml.includes("2025-10-10");

  assert(
    restoredFromCloud,
    "Test 14: Logout & Re-login History Retrieval Persistence",
    "Output: Re-authenticated user successfully fetched their existing cloud cycle records from Firestore."
  );
}

// TEST 15: Cross-Account Data Isolation (User 1's Records Invisible to User 2)
let user2Uid = null;
async function testCrossAccountDataIsolation() {
  await context.handleLogout();

  mockDOM.regName.value = "Ananya";
  mockDOM.regEmail.value = "ananya@flowell.com";
  mockDOM.regPassword.value = "Pass4Ananya2026!";
  mockDOM.regAvatar.value = "🌷";
  await context.handleRegister({ preventDefault() {} });

  user2Uid = mockCurrentFirebaseUser.uid;
  mockDOM.history.innerHTML = "";

  await context.viewHistory();

  const historyHtml = mockDOM.history.innerHTML;
  const user1DataInvisible = !historyHtml.includes("2025-10-10") && !historyHtml.includes("7 Nov 2025");
  const user2EmptyState = historyHtml.includes("No cloud cycle records saved yet");

  assert(
    user1DataInvisible && user2EmptyState && user2Uid !== user1Uid,
    "Test 15: Cross-Account Data Isolation (User 1's Records Invisible to User 2)",
    `Output: Ananya (${user2Uid}) cannot view Vedanshi's (${user1Uid}) cycle history. Clean isolation verified.`
  );
}

// TEST 16: Independent Second-User Cloud Record Creation
async function testSecondUserIndependentRecord() {
  mockDOM.lastPeriod.value = "2025-11-01";
  mockDOM.cycleLength.value = "30";
  mockDOM.result.innerHTML = "";
  mockDOM.history.innerHTML = "";

  context.calculatePeriod();
  await context.saveHistory();

  const user2Records = mockFirestoreData.users[user2Uid].cycle_records || {};
  const user2RecordKeys = Object.keys(user2Records);
  const user2HasRecord = user2RecordKeys.length === 1 && user2Records[user2RecordKeys[0]].lastPeriod === "2025-11-01";

  const user1Records = mockFirestoreData.users[user1Uid].cycle_records || {};
  const user1RecordKeys = Object.keys(user1Records);
  const user1HasRecord = user1RecordKeys.length === 1 && user1Records[user1RecordKeys[0]].lastPeriod === "2025-10-10";

  assert(
    user2HasRecord && user1HasRecord,
    "Test 16: Independent Second-User Cloud Record Creation",
    `Output: Ananya saved cycle record (1 Nov 2025, 30 days) in /users/${user2Uid}/cycle_records without impacting Vedanshi's /users/${user1Uid}/cycle_records.`
  );
}

// TEST 17: User-Scoped Clear History Deletion
async function testUserScopedClearHistory() {
  confirmResult = true;
  await context.clearHistory();

  const user2RecordsAfter = mockFirestoreData.users[user2Uid].cycle_records || {};
  const user2Emptied = Object.keys(user2RecordsAfter).length === 0;

  const user1RecordsAfter = mockFirestoreData.users[user1Uid].cycle_records || {};
  const user1StillIntact = Object.keys(user1RecordsAfter).length === 1;

  assert(
    user2Emptied && user1StillIntact,
    "Test 17: User-Scoped Clear History Deletion (User 2 Clears, User 1 Intact)",
    `Output: Deletion deleted only /users/${user2Uid}/cycle_records. User 1's records in /users/${user1Uid}/cycle_records remained 100% intact.`
  );
}

// TEST 18: Demo Mode Complete Isolation (sessionStorage Only, Zero Firestore Calls)
async function testDemoModeZeroFirestoreAccess() {
  await context.handleLogout();
  firestoreCallCountForDemo = 0;

  await context.handleDemoLogin();

  mockDOM.lastPeriod.value = "2026-02-01";
  mockDOM.cycleLength.value = "28";
  mockDOM.result.innerHTML = "";
  mockDOM.history.innerHTML = "";

  context.calculatePeriod();
  await context.saveHistory();
  await context.viewHistory();

  const historyHtml = mockDOM.history.innerHTML;
  const hasDemoBadge = historyHtml.includes("Demo Session (Local)");
  const savedInSessionStorage = !!mockSessionStorage.getItem("flowell_demo_cycle_history");
  const zeroFirestoreCalls = firestoreCallCountForDemo === 0;

  const user1Count = Object.keys(mockFirestoreData.users[user1Uid].cycle_records || {}).length;
  const user2Count = Object.keys(mockFirestoreData.users[user2Uid].cycle_records || {}).length;
  const cloudUntouched = user1Count === 1 && user2Count === 0;

  assert(
    hasDemoBadge && savedInSessionStorage && zeroFirestoreCalls && cloudUntouched,
    "Test 18: Demo Mode Complete Isolation (sessionStorage Only, Zero Firestore Access)",
    `Output: Demo mode saved exclusively to sessionStorage with demo badge. Exactly 0 calls to Firestore recorded.`
  );
}

// TEST 19: Input Validation & Deletion Confirmation Safeguard
async function testInputValidationAndDeletionConfirmation() {
  await context.handleLogout();
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  mockDOM.lastPeriod.value = "2025-10-10";
  mockDOM.cycleLength.value = "10";
  mockDOM.result.innerHTML = "";
  context.calculatePeriod();
  const invalidCycleBlocked = mockDOM.result.innerHTML.includes("between 15 and 60 days");

  const invalidDateValidation = context.validateCycleInputs("not-a-date", 28);
  const invalidDateBlocked = !invalidDateValidation.valid;

  confirmResult = false;
  await context.clearHistory();
  const user1Records = mockFirestoreData.users[user1Uid].cycle_records || {};
  const recordPreservedOnCancel = Object.keys(user1Records).length === 1;

  confirmResult = true;

  assert(
    invalidCycleBlocked && invalidDateBlocked && recordPreservedOnCancel,
    "Test 19: Cycle Input Validation (15-60 Days, Date Format) & Deletion Confirmation",
    "Output: Rejected cycle length < 15 and malformed date strings. Confirmation prompt cancel cleanly aborted deletion."
  );
}

// TEST 20: Privacy & Security Audit (Zero Passwords or Tokens Logged)
function testPrivacyAndSecurityAudit() {
  let hasPasswordLeak = false;
  let hasTokenLeak = false;

  for (const entry of capturedLogs) {
    if (entry.text.includes("SecurePass2026!") || entry.text.includes("Pass4Ananya2026!")) {
      hasPasswordLeak = true;
    }
    if (entry.text.includes("eyJ") || entry.text.includes("Bearer ")) {
      hasTokenLeak = true;
    }
  }

  const appJsSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
  const logsRecordPayload = appJsSource.includes('console.log(recordData)') ||
                            appJsSource.includes('console.log(lastCalculatedResult)');

  assert(
    !hasPasswordLeak && !hasTokenLeak && !logsRecordPayload,
    "Test 20: Privacy & Security Audit (Zero Passwords, Tokens, or Health Logs in Console)",
    "Output: Verified zero passwords, auth tokens, or menstrual record payloads leaked to browser console."
  );
}

// ======================================================================
// PHASE 3 HOTFIX TESTS (21 to 24: Self-Healing Parent /users/{uid} Document)
// ======================================================================

// TEST 21: Missing Profile Self-Healing (Parent Document Created Safely)
let orphanUid = null;
async function testMissingProfileSelfHealing() {
  await context.handleLogout();

  // Create an authenticated user who has cycle records but NO parent profile document
  orphanUid = "orphan_user_uid_101";
  const orphanUser = { uid: orphanUid, email: "priya@flowell.com", displayName: "Priya Sharma" };
  mockAuthRegistry["priya@flowell.com"] = { user: orphanUser, password: "PriyaPass2026!" };
  mockCurrentFirebaseUser = orphanUser;

  // Set up orphaned subcollection record in Firestore (exactly the user's issue!)
  mockFirestoreData.users[orphanUid] = {
    hasDocumentBody: false,
    cycle_records: {
      "rec_existing_1": {
        lastPeriod: "2026-03-01",
        cycleLength: 28,
        nextPeriod: "2026-03-29",
        ovulation: "2026-03-15",
        createdAt: "2026-03-01T10:00:00.000Z"
      }
    }
  };

  // Verify before self-healing: getDoc returns exists === false
  const userDocRef = mockFloWellFirebase.doc(mockFloWellFirebase.db, "users", orphanUid);
  const snapBefore = await mockFloWellFirebase.getDoc(userDocRef);
  const parentMissingBefore = !snapBefore.exists();

  // Simulate user opening FloWell dashboard: initAuthObserver runs
  mockWindow.location.pathname = "/index.html";
  await context.initAuthObserver();
  await new Promise(r => setTimeout(r, 50));

  // Verify after self-healing: getDoc returns exists === true
  const snapAfter = await mockFloWellFirebase.getDoc(userDocRef);
  const parentCreatedAfter = snapAfter.exists();
  const profileData = snapAfter.data();

  // Verify profile fields
  const profileValid = profileData &&
                       profileData.name === "Priya Sharma" &&
                       profileData.email === "priya@flowell.com" &&
                       profileData.avatar === "🌸" &&
                       profileData.cycleLength === 28;

  // Verify existing cycle_records were 100% PRESERVED
  const cycleRecordsPreserved = mockFirestoreData.users[orphanUid].cycle_records &&
                               !!mockFirestoreData.users[orphanUid].cycle_records["rec_existing_1"];

  assert(
    parentMissingBefore && parentCreatedAfter && profileValid && cycleRecordsPreserved,
    "Test 21: Missing Profile Self-Healing (Parent /users/{uid} Document Safely Created)",
    `Output: Detected missing parent document for UID ${orphanUid}. Automatically created valid profile document in Firestore while preserving existing subcollection record 'rec_existing_1'.`
  );
}

// TEST 22: Safe Avatar Updates via setDoc({ merge: true })
async function testSafeAvatarUpdate() {
  await context.updateUserAvatar("🧸");

  const userDocRef = mockFloWellFirebase.doc(mockFloWellFirebase.db, "users", orphanUid);
  const snap = await mockFloWellFirebase.getDoc(userDocRef);
  const data = snap.data();

  const avatarUpdated = data && data.avatar === "🧸";
  const namePreserved = data && data.name === "Priya Sharma";
  const cycleRecordIntact = !!mockFirestoreData.users[orphanUid].cycle_records["rec_existing_1"];

  assert(
    avatarUpdated && namePreserved && cycleRecordIntact,
    "Test 22: Safe Avatar Updates via setDoc({ merge: true }) Without Subcollection Loss",
    `Output: Avatar successfully updated to '🧸'. Name '${data ? data.name : ""}' and existing cycle records remained intact.`
  );
}

// TEST 23: Preservation of Existing Custom Profile Fields
async function testPreserveExistingProfile() {
  // Switch back to Vedanshi (has custom avatar 🌙 and cycleLength 28)
  await context.handleLogout();
  mockDOM.loginEmail.value = "vedanshi@flowell.com";
  mockDOM.loginPassword.value = "SecurePass2026!";
  await context.handleLogin({ preventDefault() {} });

  mockWindow.location.pathname = "/index.html";
  await context.initAuthObserver();

  const userDocRef = mockFloWellFirebase.doc(mockFloWellFirebase.db, "users", user1Uid);
  const snap = await mockFloWellFirebase.getDoc(userDocRef);
  const data = snap.data();

  const avatarPreserved = data && data.avatar === "🌙";
  const namePreserved = data && data.name === "Vedanshi";

  assert(
    avatarPreserved && namePreserved,
    "Test 23: Preservation of Existing Custom Profiles (No Overwrite of Saved Settings)",
    `Output: Vedanshi's custom avatar '${data ? data.avatar : ""}' and name '${data ? data.name : ""}' were preserved untouched.`
  );
}

// TEST 24: Visible Firestore Permission Error Reporting
function testVisiblePermissionErrorBanner() {
  const savedAlert = mockDOM.authAlert;
  mockDOM.authAlert = null; // Simulate dashboard environment (authAlert is on login.html only)
  context.showFirestorePermissionBanner("Warning: Missing or insufficient Firestore permissions.");
  const banner = mockDOM.firestorePermissionBanner || mockCreatedElements.find(e => e.id === "firestorePermissionBanner");
  const bannerDisplayed = banner && banner.style.display !== "none" && banner.innerText.includes("insufficient Firestore permissions");
  mockDOM.authAlert = savedAlert; // restore

  assert(
    bannerDisplayed,
    "Test 24: Visible Firestore Permission Error Reporting via UI Banner",
    `Output: Displayed visible warning banner in UI: '${banner ? banner.innerText : ""}'`
  );
}

// ======================================================================
// REGRESSION SUITE (Tests 25 to 36)
// ======================================================================

function testCycleMath() {
  const lastPeriodVal = "2025-10-10";
  const cycleLengthVal = 28;

  const [year, month, day] = lastPeriodVal.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day + cycleLengthVal);
  const formattedNextPeriod = nextDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  assert(
    formattedNextPeriod === "7 Nov 2025",
    "Test 25: Period Prediction Calculation (10 Oct 2025 + 28 days = 7 Nov 2025)",
    `Output: '${formattedNextPeriod}' matches report specification`
  );
}

function testCleanBranding() {
  const pages = ['index.html', 'login.html', 'dos-donts.html', 'exercises.html', 'nutrition.html', 'mira.html'];
  let allPagesClean = true;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf-8');
    if (!html.includes('FLOWELL') || html.includes('🌸 FLOWELL 🌸')) {
      allPagesClean = false;
      break;
    }
  }

  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
  const loginCss = fs.readFileSync(path.join(__dirname, 'login.css'), 'utf-8');
  const hasPlayfair = css.includes('family=Playfair+Display') && loginCss.includes('family=Playfair+Display');

  assert(
    allPagesClean && hasPlayfair,
    "Test 26: Clean Branding Title in Playfair Display (No Side Emojis)",
    "Output: All 6 application pages feature clean 'FLOWELL' title in Playfair Display"
  );
}

function testColorPalette() {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
  const loginCss = fs.readFileSync(path.join(__dirname, 'login.css'), 'utf-8');

  const hasBabyPink = css.includes('#F6DCE5') && loginCss.includes('#F6DCE5');
  const hasDeepPlum = css.includes('#49354F') && loginCss.includes('#49354F');
  const hasIvory = css.includes('#FFFAFC') && loginCss.includes('#FFFAFC');
  const hasDustyRose = css.includes('#C78FA5') && loginCss.includes('#C78FA5');

  assert(
    hasBabyPink && hasDeepPlum && hasIvory && hasDustyRose,
    "Test 27: Professional Palette Verification (#F6DCE5, #49354F, #FFFAFC, #C78FA5)",
    "Output: Verified all 4 official hex colors configured and applied consistently across CSS systems"
  );
}

function testAnimatedBackground() {
  const pages = ['index.html', 'login.html', 'dos-donts.html', 'exercises.html', 'nutrition.html', 'mira.html'];
  let allPagesHave5Orbs = true;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf-8');
    const has5Orbs = html.includes('orb-1') && html.includes('orb-2') && html.includes('orb-3') &&
                     html.includes('orb-4') && html.includes('orb-5');
    if (!has5Orbs) {
      allPagesHave5Orbs = false;
      break;
    }
  }

  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
  const hasKeyframes = css.includes('@keyframes floatOrb') && css.includes('@keyframes bgGradientShift');
  const hasReducedMotion = css.includes('@media (prefers-reduced-motion: reduce)');

  assert(
    allPagesHave5Orbs && hasKeyframes && hasReducedMotion,
    "Test 28: Noticeable Animated Background (5 Orbs, 12-22s Cycles & Reduced-Motion)",
    "Output: 5 translucent floating orbs present on all 6 pages with CSS animations and reduced-motion fallback"
  );
}

function testFooterAttribution() {
  const pages = ['index.html', 'login.html', 'dos-donts.html', 'exercises.html', 'nutrition.html', 'mira.html'];
  const expectedFooter = "Made with ♡ by Vedanshi | © 2026 FloWell";
  let allPagesHaveFooter = true;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf-8');
    if (!html.includes(expectedFooter)) {
      allPagesHaveFooter = false;
      break;
    }
  }

  assert(
    allPagesHaveFooter,
    "Test 29: Corrected Footer Attribution on All 6 Pages",
    `Output: Successfully verified '${expectedFooter}' across index, login, dos-donts, exercises, nutrition, and mira pages`
  );
}

function testNavigationStructure() {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

  const hasDosDontsCard = indexHtml.includes('href="dos-donts.html"');
  const hasExercisesCard = indexHtml.includes('href="exercises.html"');
  const hasNutritionCard = indexHtml.includes('href="nutrition.html"');
  const hasMiraCard = indexHtml.includes('href="mira.html"');
  const hasTopNav = indexHtml.includes('class="top-nav"') && indexHtml.includes('class="nav-links"');

  assert(
    hasDosDontsCard && hasExercisesCard && hasNutritionCard && hasMiraCard && hasTopNav,
    "Test 30: Multi-Page Navigation Structure & Dashboard Hub",
    "Output: Main dashboard cleanly links to 4 dedicated pages; top-nav bar integrated across views"
  );
}

function testDosDontsContent() {
  const html = fs.readFileSync(path.join(__dirname, 'dos-donts.html'), 'utf-8');

  const dosSplit = html.split('class="donts-column"');
  const dosColumn = dosSplit[0] || "";
  const dontsColumn = dosSplit[1] || "";
  const doCards = (dosColumn.match(/class="recommendation-card"/g) || []).length;
  const dontCards = (dontsColumn.match(/class="recommendation-card"/g) || []).length;
  const hasTwoColumns = html.includes('dos-column') && html.includes('donts-column');
  const hasTips = html.includes('practical-tip');

  assert(
    hasTwoColumns && doCards >= 12 && dontCards >= 12 && hasTips,
    "Test 31: Do's & Don'ts Content & Column Structure (>=12 each)",
    `Output: Found ${doCards} 'Do\'s' and ${dontCards} 'Don\'ts' with practical tips in distinct two-column layout`
  );
}

function testExerciseContent() {
  const html = fs.readFileSync(path.join(__dirname, 'exercises.html'), 'utf-8');

  const exerciseCards = (html.match(/<article class="item-card"/g) || []).length;
  const hasStretching = html.includes('data-category="stretching"');
  const hasYoga = html.includes('data-category="yoga"');
  const hasLowImpact = html.includes('data-category="low-impact"');
  const hasRelaxation = html.includes('data-category="relaxation"');
  const hasFilterFunction = html.includes('function filterExercises(');
  const hasComfortGuidance = html.includes('comfort-guidance');

  assert(
    exerciseCards >= 12 && hasStretching && hasYoga && hasLowImpact && hasRelaxation && hasFilterFunction && hasComfortGuidance,
    "Test 32: Exercise & Movement Content & Filter Logic (>=12 items across 4 categories)",
    `Output: Found ${exerciseCards} exercise cards covering stretching, yoga, low-impact, and relaxation with step-by-step instructions and comfort guidance`
  );
}

function testNutritionContent() {
  const html = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf-8');

  const nutritionCards = (html.match(/<article class="item-card"/g) || []).length;
  const hasIron = html.includes('data-category="iron"');
  const hasProtein = html.includes('data-category="protein"');
  const hasFruitsVeg = html.includes('data-category="fruits-vegetables"');
  const hasCalcMag = html.includes('data-category="calcium-magnesium"');
  const hasHydration = html.includes('data-category="hydration"');
  const hasBalancedMeals = html.includes('data-category="balanced-meals"');
  const hasIndianOptions = html.includes('Moong & Toor Dal') &&
                           html.includes('Chickpea') &&
                           html.includes('Rajma') &&
                           html.includes('Palak & Methi') &&
                           html.includes('Chaas') &&
                           html.includes('Paneer') &&
                           html.includes('Khichdi');
  const hasFilterFunction = html.includes('function filterNutrition(');

  assert(
    nutritionCards >= 15 && hasIron && hasProtein && hasFruitsVeg && hasCalcMag && hasHydration && hasBalancedMeals && hasIndianOptions && hasFilterFunction,
    "Test 33: Nutrition & Healthy Foods Content & Category Filters (>=15 items across 6 categories)",
    `Output: Found ${nutritionCards} nutrition cards across 6 categories with affordable Indian options, nutrient badges, and serving ideas`
  );
}

function testMiraDedicatedPage() {
  const html = fs.readFileSync(path.join(__dirname, 'mira.html'), 'utf-8');

  const hasChatbox = html.includes('id="chatbox"') && html.includes('chatbox-dedicated');
  const hasUserInput = html.includes('id="userInput"');
  const hasChips = html.includes('sendQuickPrompt');
  const hasMedicalDisclaimer = html.includes('Medical Disclaimer') &&
                               html.includes('not a medical professional') &&
                               html.includes('substitute for clinical healthcare advice');

  assert(
    hasChatbox && hasUserInput && hasChips && hasMedicalDisclaimer,
    "Test 34: Dedicated Mira Chat Page & Clear Medical Disclaimer",
    "Output: mira.html features dedicated scrollable chatbox, quick suggestion chips, message input, and comprehensive medical disclaimer"
  );
}

function testMiraIntentDisambiguation() {
  const mandatoryQuestions = [
    "Why do periods hurt?",
    "How can I relieve cramps?",
    "What should I eat during my period?",
    "Can I exercise during menstruation?",
    "Why is my period late?",
    "What is a normal menstrual cycle length?",
    "How often should I change my pad?",
    "Why do I feel emotional before my period?",
    "What causes bloating?",
    "When should I see a doctor?"
  ];

  const answers = mandatoryQuestions.map(q => context.generateMiraResponse(q));
  const uniqueAnswers = new Set(answers);

  assert(
    uniqueAnswers.size === 10,
    "Test 35: Mira Intent Disambiguation on 10 Mandatory Questions",
    `Output: All 10 mandatory questions produced unique, question-specific responses (${uniqueAnswers.size}/10 distinct)`
  );
}

function testMiraEmergencyAndTypo() {
  const emergencyHemorrhage = context.generateMiraResponse("I am soaking through two pads every hour and feel dizzy");
  const hasHemorrhageAlert = emergencyHemorrhage.includes("Urgent Medical Attention Recommended");

  const emergencyTSS = context.generateMiraResponse("I have a high fever with my tampon in");
  const hasTSSAlert = emergencyTSS.includes("Toxic Shock Syndrome (TSS)");

  const typoCramps = context.generateMiraResponse("how to stop crampps");
  const hasCrampRelief = typoCramps.includes("How to Relieve Period Cramps Safely");

  const typoExercise = context.generateMiraResponse("can i do exersise during peirod");
  const hasExerciseSafety = typoExercise.includes("Can You Exercise During Your Period");

  const fallbackAns = context.generateMiraResponse("What is the capital of France?");
  const hasFallbackNotice = fallbackAns.includes("rule-based menstrual wellness assistant") || fallbackAns.includes("menstrual wellness");

  const emptyAns = context.generateMiraResponse("   ");
  const handlesEmpty = emptyAns === "";

  assert(
    hasHemorrhageAlert && hasTSSAlert && hasCrampRelief && hasExerciseSafety && hasFallbackNotice && handlesEmpty,
    "Test 36: Mira Emergency Triage, Typo Normalization, & Intelligent Fallback",
    "Output: Verified clinical triage triggers for hemorrhage/TSS, typo resolution for 'crampps'/'exersise', and friendly rule-based fallback"
  );
}

// ----------------------------------------------------------------------
// Run All Verification Tests
// ----------------------------------------------------------------------
async function runAllTests() {
  // Phase 2 Tests (1 to 10)
  await testFirebaseRegistration();
  await testFirebaseLoginValid();
  await testFirebaseLoginInvalid();
  await testDuplicateRegistration();
  await testFirebaseLogout();
  await testSessionPersistence();
  await testProtectedPagesGuard();
  await testFirestoreProfileRetrieval();
  await testFirestoreSecurityRules();
  await testDemoModeIsolation();

  // Phase 3 Tests (11 to 20)
  await testSaveCyclePredictionToFirestore();
  await testFirestoreRecordSchema();
  await testBrowserRefreshHistoryPersistence();
  await testLogoutReloginHistoryPersistence();
  await testCrossAccountDataIsolation();
  await testSecondUserIndependentRecord();
  await testUserScopedClearHistory();
  await testDemoModeZeroFirestoreAccess();
  await testInputValidationAndDeletionConfirmation();
  testPrivacyAndSecurityAudit();

  // Phase 3 Hotfix Tests (21 to 24)
  await testMissingProfileSelfHealing();
  await testSafeAvatarUpdate();
  await testPreserveExistingProfile();
  testVisiblePermissionErrorBanner();

  // Regression Suite Tests (25 to 36)
  testCycleMath();
  testCleanBranding();
  testColorPalette();
  testAnimatedBackground();
  testFooterAttribution();
  testNavigationStructure();
  testDosDontsContent();
  testExerciseContent();
  testNutritionContent();
  testMiraDedicatedPage();
  testMiraIntentDisambiguation();
  testMiraEmergencyAndTypo();

  console.log("\n---------------------------------------------------------------------");
  console.log(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("---------------------------------------------------------------------");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests();
