import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { getStoredUser, storeSignedInUser } from "./auth-ui.js";

const googleLoginButton = document.getElementById("googleLoginButton");
const loginStatus = document.getElementById("loginStatus");

if (getStoredUser()) {
  window.location.replace("/dashboard");
}

function setStatus(message, isError = false) {
  if (!loginStatus) return;
  loginStatus.textContent = message;
  loginStatus.hidden = false;
  loginStatus.classList.toggle("is-error", isError);
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

googleLoginButton?.addEventListener("click", async () => {
  if (!isFirebaseConfigured) {
    setStatus("Add your Firebase web app config in public/js/firebase-config.js first.", true);
    return;
  }

  googleLoginButton.disabled = true;
  googleLoginButton.querySelector("span:last-child").textContent = "Signing in...";
  setStatus("Opening Google sign-in...");

  try {
    const [{ initializeApp, getApps }, { GoogleAuthProvider, getAuth, signInWithPopup }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
    ]);

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();

    setStatus("Saving your profile in CloudSW3...");
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "CloudSW3 sign-in failed.");

    const user = result.user;
    storeSignedInUser(user);
    window.location.href = "/dashboard";
  } catch (error) {
    googleLoginButton.disabled = false;
    googleLoginButton.querySelector("span:last-child").textContent = "Sign in with Google";
    setStatus(error.message || "Google sign-in failed.", true);
  }
});
