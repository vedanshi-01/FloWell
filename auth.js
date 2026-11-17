/**
 * ============================================================================
 * FloWell: Firebase Authentication & Cloud Firestore Profile Management
 * Phase 2 Integration
 * ============================================================================
 * Architecture & Security:
 * - Uses real Firebase Email/Password Authentication (via official Firebase Web SDK v10).
 * - Cloud user profiles stored in Cloud Firestore at /users/{uid}.
 * - Passwords, password hashes, and auth tokens are NEVER stored in Firestore
 *   or application-managed localStorage.
 * - One-click demo mode is completely isolated using sessionStorage (no Firebase UID,
 *   never accesses private Cloud Firestore documents).
 * ============================================================================
 */

const STORAGE_KEY_DEMO_SESSION = "flowell_demo_session";

// Flag to prevent onAuthStateChanged from prematurely redirecting during active registration
let isRegistering = false;

/**
 * Access the initialized Firebase instances from window.FloWellFirebase
 */
function getFirebase() {
  if (typeof window !== "undefined" && window.FloWellFirebase) {
    return window.FloWellFirebase;
  }
  return null;
}

/**
 * Wait for the Firebase module to be fully loaded and initialized
 */
function waitForFirebase() {
  return new Promise((resolve) => {
    const existing = getFirebase();
    if (existing && existing.auth && existing.db) {
      return resolve(existing);
    }

    if (typeof window === "undefined") {
      return resolve(null);
    }

    const handler = (e) => {
      window.removeEventListener("flowell-firebase-ready", handler);
      resolve(e.detail || getFirebase());
    };

    window.addEventListener("flowell-firebase-ready", handler);

    // Timeout safety fallback after 4 seconds
    setTimeout(() => {
      window.removeEventListener("flowell-firebase-ready", handler);
      resolve(getFirebase());
    }, 4000);
  });
}

// ============================================================================
// 1. ISOLATED DEMO SESSION MANAGEMENT
// ============================================================================

function isDemoSessionActive() {
  try {
    if (typeof sessionStorage === "undefined") return false;
    const raw = sessionStorage.getItem(STORAGE_KEY_DEMO_SESSION);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed && parsed.isDemo === true;
  } catch (e) {
    return false;
  }
}

function getDemoSession() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(STORAGE_KEY_DEMO_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setDemoSession(data) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY_DEMO_SESSION, JSON.stringify(data));
    }
  } catch (e) {
    console.error("Error setting demo session:", e);
  }
}

function clearDemoSession() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY_DEMO_SESSION);
    }
  } catch (e) {}
}

/**
 * One-click Instant Demo Access
 * Isolated in sessionStorage; does not interact with Cloud Firestore.
 */
async function handleDemoLogin() {
  const fb = getFirebase();
  if (fb && fb.auth && fb.auth.currentUser) {
    try {
      await fb.signOut(fb.auth);
    } catch (e) {}
  }

  const demoUser = {
    isDemo: true,
    name: "Sarah (Demo User)",
    email: "demo@flowell.com",
    avatar: "🌸",
    cycleLength: 28,
    lastPeriod: "2026-10-10"
  };

  setDemoSession(demoUser);
  window.location.href = "index.html";
}

// ============================================================================
// 2. UI HELPERS & ALERT BOX
// ============================================================================

function showAuthAlert(message, type = "error") {
  if (typeof document === "undefined") return;
  const alertBox = document.getElementById("authAlert");
  if (!alertBox) return;

  alertBox.className = `alert-box alert-${type}`;
  alertBox.innerText = message;
  alertBox.style.display = "block";

  if (typeof alertBox.scrollIntoView === "function") {
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Visibly displays Firestore permission and network errors on dashboard/protected pages
 */
function showFirestorePermissionBanner(message) {
  if (typeof document === "undefined") return;

  const authAlert = document.getElementById("authAlert");
  if (authAlert) {
    showAuthAlert(message, "error");
    return;
  }

  let banner = document.getElementById("firestorePermissionBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "firestorePermissionBanner";
    banner.className = "alert-box alert-error";
    banner.style.cssText =
      "margin: 12px auto; max-width: 600px; padding: 12px 16px; border-radius: 10px; background: rgba(220, 53, 69, 0.12); color: #721c24; border: 1px solid rgba(220, 53, 69, 0.3); font-size: 0.88rem; text-align: center;";
    const container = document.querySelector(".page-wrapper") || document.body;
    if (container && container.firstChild) {
      container.insertBefore(banner, container.firstChild.nextSibling);
    } else if (container) {
      container.appendChild(banner);
    }
  }
  if (banner) {
    banner.innerText = message;
    banner.style.display = "block";
  }
}

function selectRegisterAvatar(avatarEmoji) {
  if (typeof document === "undefined") return;
  const hiddenInput = document.getElementById("regAvatar");
  if (hiddenInput) hiddenInput.value = avatarEmoji;

  const buttons = document.querySelectorAll(".avatar-choice-btn");
  buttons.forEach(btn => {
    if (btn.getAttribute("data-avatar") === avatarEmoji) {
      btn.classList.add("selected");
    } else {
      btn.classList.remove("selected");
    }
  });
}

// ============================================================================
// 3. FIREBASE REGISTRATION WITH CLOUD FIRESTORE PROFILE
// ============================================================================

async function handleRegister(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nameInput = document.getElementById("regName");
  const emailInput = document.getElementById("regEmail");
  const passwordInput = document.getElementById("regPassword");
  const avatarInput = document.getElementById("regAvatar");

  if (!nameInput || !emailInput || !passwordInput) return;

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const avatar = (avatarInput && avatarInput.value) ? avatarInput.value.trim() : "🌸";

  // 1. Validate empty fields
  if (!name || !email || !password) {
    showAuthAlert("Please enter all fields", "error");
    return;
  }

  // 2. Validate password length
  if (password.length < 6) {
    showAuthAlert("Password should be at least 6 characters.", "error");
    return;
  }

  const fb = await waitForFirebase();
  if (!fb || !fb.auth || !fb.db) {
    showAuthAlert("Firebase is initializing. Please check your internet connection and try again.", "error");
    return;
  }

  // Prevent onAuthStateChanged on login.html from prematurely redirecting before Firestore write completes
  isRegistering = true;

  try {
    // 3. Create user in Firebase Authentication
    const userCredential = await fb.createUserWithEmailAndPassword(fb.auth, email, password);
    const user = userCredential.user;

    // 4. Create Firestore profile at /users/{uid}
    // Note: No passwords or auth tokens are stored!
    const profileData = {
      name: name,
      email: email.toLowerCase(),
      avatar: avatar,
      cycleLength: 28,
      createdAt: new Date().toISOString()
    };

    try {
      // Use { merge: true } to create or merge the profile without touching subcollections
      await fb.setDoc(fb.doc(fb.db, "users", user.uid), profileData, { merge: true });
    } catch (firestoreError) {
      isRegistering = false;
      console.error("Firestore profile creation failed:", firestoreError);
      showAuthAlert("Account created, but failed to save cloud profile: " + (firestoreError.message || "Permission issue"), "error");
      return;
    }

    // Clear any active demo session
    clearDemoSession();

    showAuthAlert("Registration successful! Welcome to FloWell...", "success");
    isRegistering = false;
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  } catch (authError) {
    isRegistering = false;
    console.error("Firebase registration error:", authError);
    let friendlyMessage = "Registration failed. Please try again.";

    switch (authError.code) {
      case "auth/email-already-in-use":
        friendlyMessage = "An account with this email already exists. Please log in.";
        break;
      case "auth/invalid-email":
        friendlyMessage = "Please enter a valid email address.";
        break;
      case "auth/weak-password":
        friendlyMessage = "Password should be at least 6 characters.";
        break;
      case "auth/network-request-failed":
        friendlyMessage = "Network error. Please check your internet connection.";
        break;
      default:
        friendlyMessage = authError.message || friendlyMessage;
    }

    showAuthAlert(friendlyMessage, "error");
  }
}

// ============================================================================
// 4. FIREBASE LOGIN
// ============================================================================

async function handleLogin(event) {
  if (event && event.preventDefault) event.preventDefault();

  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showAuthAlert("Please enter all fields", "error");
    return;
  }

  const fb = await waitForFirebase();
  if (!fb || !fb.auth) {
    showAuthAlert("Firebase is initializing. Please check your internet connection and try again.", "error");
    return;
  }

  try {
    // Authenticate using Firebase Email/Password Auth
    await fb.signInWithEmailAndPassword(fb.auth, email, password);

    // Clear any demo session
    clearDemoSession();

    showAuthAlert("Login successful! Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);
  } catch (error) {
    console.error("Firebase login error:", error);
    let friendlyMessage = "Invalid credentials. Please check your email and password.";

    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        friendlyMessage = "Invalid credentials. Please check your email and password.";
        break;
      case "auth/invalid-email":
        friendlyMessage = "Please enter a valid email address.";
        break;
      case "auth/too-many-requests":
        friendlyMessage = "Too many failed attempts. Please try again in a few minutes.";
        break;
      case "auth/network-request-failed":
        friendlyMessage = "Network error. Please check your internet connection.";
        break;
      default:
        friendlyMessage = error.message || friendlyMessage;
    }

    showAuthAlert(friendlyMessage, "error");
  }
}

// ============================================================================
// 5. SESSION MANAGEMENT & ROUTE GUARD (onAuthStateChanged)
// ============================================================================

/**
 * Initializes the Firebase Auth Observer across all pages.
 * Preserves sessions across navigation & refreshes, loads Firestore profile,
 * and guards protected pages from unauthorized access.
 */
function initAuthObserver() {
  if (typeof window === "undefined") return Promise.resolve();

  const pathname = window.location.pathname || "";
  const isLoginPage = pathname.endsWith("login.html") || pathname === "/" || pathname === "";

  return waitForFirebase().then((fb) => {
    if (!fb || !fb.auth) {
      if (!isLoginPage && !isDemoSessionActive()) {
        window.location.replace("login.html");
      }
      return;
    }

    fb.onAuthStateChanged(fb.auth, async (user) => {
      if (user) {
        // Authenticated with Firebase!
        if (isLoginPage) {
          if (isRegistering) {
            // Active registration in flight: let handleRegister complete profile write & redirect
            return;
          }
          window.location.replace("index.html");
          return;
        }

        // Fetch user profile from Cloud Firestore at /users/{uid}
        try {
          const userDocRef = fb.doc(fb.db, "users", user.uid);
          let snap = null;
          try {
            snap = await fb.getDoc(userDocRef);
          } catch (readErr) {
            console.error("Error reading Firestore profile:", readErr);
            showFirestorePermissionBanner("Warning: Could not read cloud profile: " + (readErr.message || "Permission issue"));
          }

          let profile = null;

          if (snap && typeof snap.exists === "function" && snap.exists()) {
            profile = snap.data();

            // Ensure any missing standard fields are filled without overwriting saved values
            let needsPatch = false;
            const patch = {};
            if (!profile.name) {
              profile.name = user.displayName || (user.email ? user.email.split("@")[0] : "FloWell User");
              patch.name = profile.name;
              needsPatch = true;
            }
            if (!profile.email) {
              profile.email = (user.email || "").toLowerCase();
              patch.email = profile.email;
              needsPatch = true;
            }
            if (!profile.avatar) {
              profile.avatar = "🌸";
              patch.avatar = "🌸";
              needsPatch = true;
            }
            if (!profile.cycleLength) {
              profile.cycleLength = 28;
              patch.cycleLength = 28;
              needsPatch = true;
            }
            if (needsPatch) {
              try {
                await fb.setDoc(userDocRef, patch, { merge: true });
              } catch (patchErr) {
                console.warn("Could not patch partial profile fields:", patchErr);
              }
            }
          } else {
            // MISSING PROFILE SELF-HEALING:
            // The /users/{uid} document does not exist in Firestore.
            // Safely create the profile using authenticated user UID and available account information.
            const fallbackName = user.displayName || (user.email ? user.email.split("@")[0] : "FloWell User");
            profile = {
              name: fallbackName,
              email: (user.email || "").toLowerCase(),
              avatar: "🌸",
              cycleLength: 28,
              createdAt: new Date().toISOString()
            };

            try {
              // Create parent /users/{uid} with merge: true (never touches cycle_records subcollection!)
              await fb.setDoc(userDocRef, profile, { merge: true });
              console.log("🌸 Successfully self-healed and created missing Cloud Firestore profile at /users/" + user.uid);
            } catch (healError) {
              console.error("Failed to self-heal missing Firestore profile:", healError);
              showFirestorePermissionBanner("Warning: Could not save cloud profile to Firestore: " + (healError.message || "Permission denied"));
            }
          }

          // Hydrate user badge in top navigation
          const nameEl = document.getElementById("userNameText");
          const avatarEl = document.getElementById("userAvatarEmoji");
          if (nameEl) nameEl.innerText = profile.name || "User";
          if (avatarEl) avatarEl.innerText = profile.avatar || "🌸";

          // Prefill cycle length input on dashboard
          const cycleInput = document.getElementById("cycleLength");
          if (cycleInput && profile.cycleLength) {
            cycleInput.value = profile.cycleLength;
          }
        } catch (err) {
          console.error("Error loading Firestore profile:", err);
          showFirestorePermissionBanner("Warning: Error loading Firestore profile: " + (err.message || "Unknown issue"));
        }
      } else {
        // Not authenticated in Firebase
        if (isDemoSessionActive()) {
          // Demo user session active
          const demoUser = getDemoSession();
          const nameEl = document.getElementById("userNameText");
          const avatarEl = document.getElementById("userAvatarEmoji");
          if (nameEl) nameEl.innerText = demoUser.name || "Demo User";
          if (avatarEl) avatarEl.innerText = demoUser.avatar || "🌸";
          return;
        }

        // Neither Firebase user nor Demo user: redirect to login if on protected page
        if (!isLoginPage) {
          window.location.replace("login.html");
        }
      }
    });
  });
}

/**
 * Route guard invoked on protected pages
 */
function requireAuth() {
  initAuthObserver();
}

/**
 * Checks session synchronously (for backwards compatibility / immediate display)
 */
function checkUserSession() {
  if (isDemoSessionActive()) {
    return getDemoSession();
  }
  const fb = getFirebase();
  if (fb && fb.auth && fb.auth.currentUser) {
    return {
      email: fb.auth.currentUser.email,
      name: fb.auth.currentUser.displayName || fb.auth.currentUser.email.split("@")[0],
      avatar: "🌸"
    };
  }
  return null;
}

// ============================================================================
// 6. AVATAR PROFILE UPDATE IN CLOUD FIRESTORE
// ============================================================================

async function updateUserAvatar(newAvatar) {
  if (!newAvatar) return;

  const fb = getFirebase();
  if (fb && fb.auth && fb.auth.currentUser) {
    try {
      const userRef = fb.doc(fb.db, "users", fb.auth.currentUser.uid);
      // Use setDoc with { merge: true } so avatar updates even if profile was being initialized
      await fb.setDoc(userRef, { avatar: newAvatar }, { merge: true });

      const avatarEl = document.getElementById("userAvatarEmoji");
      if (avatarEl) avatarEl.innerText = newAvatar;
      console.log("🌸 Avatar updated in Cloud Firestore:", newAvatar);
    } catch (err) {
      console.error("Failed to update avatar in Firestore:", err);
      showFirestorePermissionBanner("Warning: Failed to update avatar in Cloud Firestore: " + (err.message || "Permission issue"));
    }
  } else if (isDemoSessionActive()) {
    const demo = getDemoSession();
    demo.avatar = newAvatar;
    setDemoSession(demo);
    const avatarEl = document.getElementById("userAvatarEmoji");
    if (avatarEl) avatarEl.innerText = newAvatar;
  }
}

// ============================================================================
// 7. LOGOUT (Firebase signOut)
// ============================================================================

async function handleLogout() {
  const fb = getFirebase();
  if (fb && fb.auth) {
    try {
      await fb.signOut(fb.auth);
    } catch (e) {
      console.warn("Firebase signout error:", e);
    }
  }
  clearDemoSession();
  window.location.href = "login.html";
}

// ============================================================================
// 8. GLOBAL WINDOW ATTACHMENTS (for inline HTML event handlers)
// ============================================================================

if (typeof window !== "undefined") {
  window.getFirebase = getFirebase;
  window.waitForFirebase = waitForFirebase;
  window.showFirestorePermissionBanner = showFirestorePermissionBanner;
  window.handleRegister = handleRegister;
  window.handleLogin = handleLogin;
  window.handleLogout = handleLogout;
  window.handleDemoLogin = handleDemoLogin;
  window.selectRegisterAvatar = selectRegisterAvatar;
  window.updateUserAvatar = updateUserAvatar;
  window.requireAuth = requireAuth;
  window.checkUserSession = checkUserSession;
  window.initAuthObserver = initAuthObserver;
  window.isDemoSessionActive = isDemoSessionActive;
  window.getDemoSession = getDemoSession;
  window.setDemoSession = setDemoSession;
  window.clearDemoSession = clearDemoSession;

  // Initialize observer on DOM ready
  document.addEventListener("DOMContentLoaded", () => {
    initAuthObserver();
  });
}
