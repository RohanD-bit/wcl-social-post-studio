const GOOGLE_API_SCRIPT = "https://apis.google.com/js/api.js";
const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const GOOGLE_PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || "";
const GOOGLE_PICKER_APP_ID =
  import.meta.env.VITE_GOOGLE_APP_ID || (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").split("-")[0] || "";

let pickerScriptPromise;
let pickerApiPromise;

function loadGoogleApiScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Picker is only available in the browser."));
  }

  if (window.gapi?.load) {
    return Promise.resolve();
  }

  if (!pickerScriptPromise) {
    pickerScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GOOGLE_API_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google Picker. Check your browser connection."));
      document.head.appendChild(script);
    });
  }

  return pickerScriptPromise;
}

async function loadPickerApi() {
  await loadGoogleApiScript();

  if (window.google?.picker) {
    return;
  }

  if (!pickerApiPromise) {
    pickerApiPromise = new Promise((resolve, reject) => {
      window.gapi.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Google Picker API could not load.")),
        timeout: 12000,
        ontimeout: () => reject(new Error("Google Picker API timed out.")),
      });
    });
  }

  await pickerApiPromise;
}

export async function pickGoogleSpreadsheet(accessToken) {
  if (!accessToken) {
    throw new Error("Sign in with Google before choosing a Sheet.");
  }
  if (!GOOGLE_PICKER_API_KEY) {
    throw new Error("Google Picker API key is missing. Add VITE_GOOGLE_PICKER_API_KEY to your .env and Vercel.");
  }
  if (!GOOGLE_PICKER_APP_ID) {
    throw new Error("Google Picker app ID is missing. Add VITE_GOOGLE_APP_ID with your Google Cloud project number.");
  }

  await loadPickerApi();

  return new Promise((resolve, reject) => {
    const picker = window.google.picker;
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS)
      .setMimeTypes(GOOGLE_SHEETS_MIME_TYPE)
      .setMode(picker.DocsViewMode.LIST)
      .setSelectFolderEnabled(false);

    const dialog = new picker.PickerBuilder()
      .addView(view)
      .setAppId(GOOGLE_PICKER_APP_ID)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setOAuthToken(accessToken)
      .setTitle("Choose a Google Sheet")
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) {
          resolve(null);
          return;
        }

        if (action !== picker.Action.PICKED) return;

        const document = data[picker.Response.DOCUMENTS]?.[0];
        if (!document) {
          reject(new Error("Google Picker did not return a selected spreadsheet."));
          return;
        }

        resolve({
          id: document[picker.Document.ID],
          name: document[picker.Document.NAME] || "Google Sheet",
          webViewLink: document[picker.Document.URL] || "",
        });
      })
      .build();

    dialog.setVisible(true);
  });
}
