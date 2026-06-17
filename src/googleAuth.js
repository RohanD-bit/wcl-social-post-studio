export const GOOGLE_SHEETS_SCOPE = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

let identityScriptPromise;

function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is only available in the browser."));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!identityScriptPromise) {
    identityScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google sign-in. Check your browser connection."));
      document.head.appendChild(script);
    });
  }

  return identityScriptPromise;
}

export async function requestGoogleSheetsAccessToken() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID in Vercel and your local .env file.");
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Google sign-in was not completed. Try Connect Google Sheet again."));
    }, 90000);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SHEETS_SCOPE,
      callback: (response) => {
        if (response?.error) {
          finish(() => reject(new Error(response.error_description || response.error)));
          return;
        }

        if (!response?.access_token) {
          finish(() => reject(new Error("Google did not return sheet access. Try signing in again.")));
          return;
        }

        finish(() => resolve(response.access_token));
      },
    });

    try {
      tokenClient.requestAccessToken();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
