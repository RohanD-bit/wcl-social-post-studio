# WCL Social Post Studio

A React dashboard for turning Washington Cricket League form submissions into Facebook-ready Player of the Match graphics and captions.

## Development

```bash
npm install
npm run dev
```

Create a local `.env` file first if you want to test Google sign-in:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_PICKER_API_KEY=your-google-api-key
VITE_GOOGLE_APP_ID=your-google-cloud-project-number
```

## Production

```bash
npm run build
```

## Google Sheet Connection

The app starts without submission data. A user can connect Google Sheet with Google sign-in, browse Google Drive in the Google Picker, choose a spreadsheet, and then load the tab that contains player submissions.

Google sign-in uses read-only Sheets access plus Picker file access:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
https://www.googleapis.com/auth/drive.file
```

To enable it:

1. Create an OAuth Client ID for a web application in Google Cloud Console.
2. Enable **Google Sheets API** and **Google Picker API** in the project.
3. Add the two scopes above to the OAuth consent screen and add testers while the app is in Testing mode.
4. Add local and production origins, for example `http://127.0.0.1:8787`, `http://127.0.0.1:8788`, and `https://wcl-social-post-studio.vercel.app`.
5. Create an API key in **APIs & Services > Credentials**.
6. Add these Vercel environment variables:
   `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY`, and `VITE_GOOGLE_APP_ID`.
   `VITE_GOOGLE_APP_ID` is the Google Cloud project number.
7. Redeploy after adding the environment variables.

After the user connects and chooses a spreadsheet, the app auto-loads the `Form Responses` tab when it can find one. If the spreadsheet has multiple tabs and no obvious response tab, the app asks which tab to load.
