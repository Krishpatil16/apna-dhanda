# Apna Dhanda: apne laptop pe setup (Windows)

Ye guide aapke liye hai, Krish. Isme step-by-step likha hai ki "Apna Dhanda" website ka poora code apne laptop pe kaise chalana hai, badalna hai aur live karna hai. Coding ka experience zaroori nahi hai, bas har step dhyan se follow karo.

**Live site:** https://apnadhanda.krishpatil.workers.dev
- Main page: `/`
- Dukaandar: `/admin`
- Dev panel: `/dev`
- Customer dukaan: `/s/dukaan-ka-link`

**Cloudflare:** Worker ka naam **apnadhanda** hai aur database **kirana-db** hai, account "Krish patil" mein.

> ⚠️ **Sabse zaroori baat:** hamesha sirf **apnadhanda** Worker deploy karna. **"kirana" naam ka Worker kabhi deploy ya create mat karna**. Wo jaan-boojh kar delete kiya gaya tha. Is zip ki dono config files (`wrangler.apnadhanda.toml` aur `wrangler.toml`) apnadhanda hi deploy karti hain.

---

## 1. Zaroori software install karo (sirf ek baar)

1. **Node.js LTS**
   - https://nodejs.org kholo, hara (green) **"LTS"** button dabao aur download karo.
   - Installer chalao, sab default rakho, bas Next → Next → Install.
2. **VS Code**
   - https://code.visualstudio.com se **Download for Windows** karo aur install karo.
   - Install karte waqt "Add to PATH" tick rehne do.
3. Check karo ki Node install hua:
   - Start menu mein "PowerShell" kholo aur ye likho:
     ```
     node -v
     npm -v
     ```
   - Dono ka version number dikhe (jaise `v22.x.x`) to sab theek hai.

## 2. Zip kholo aur VS Code mein folder kholo

1. `apna-dhanda-full-source.zip` pe right-click karo → **Extract All…**
   - Folder kahin aasaan jagah rakho, jaise `C:\apna-dhanda`.
2. VS Code kholo → **File → Open Folder…** → wo folder chuno jisme `package.json` hai.
   - "Do you trust the authors?" pooche to **Yes** dabao.
3. Terminal kholo: upar menu **Terminal → New Terminal** (ya `Ctrl + ~` dabao). Neeche ek kaala box khulega. Aage ke saare commands yahin likhne hain.
4. Ye command chalao. Ye zaroori tools download karega, 1–3 minute lagenge:
   ```
   npm install
   ```
   - Peeli (yellow) "warn" lines aaye to ghabrana mat, wo normal hain.
   - Laal "ERR!" aaye to Node dobara install karke phir try karo.

## 3. Apne Cloudflare account se login karo

```
npx wrangler login
```
- Browser khulega. Wahan apne Cloudflare account mein login karo (<your Cloudflare account email>) aur **Allow** dabao.
- Check karo ki sahi account hai:
  ```
  npx wrangler whoami
  ```
  Isme account **"Krish patil"** dikhna chahiye.

## 4. Laptop pe test karne ke liye chalao

```
npm start
```
(Ye `npx wrangler dev --config wrangler.apnadhanda.toml` hi chalata hai.)

- Browser mein kholo: **http://localhost:8787**
  - `/admin` aur `/dev` bhi khulenge.
- Laptop wala version ek **alag khaali database** use karta hai, isliye live dukaanein yahan nahi dikhengi. Jo bhi test karo, live site pe kuch nahi badlega. 👍
  - Dev login: username `krish-dev`. Password wahi hai jo shuru mein mila tha (laptop pe password change kiya ho to bhi live pe purana hi rahega).
- Band karne ke liye terminal mein `Ctrl + C` dabao.

## 5. Kaunsi file mein kya hai (files map)

| Kya badalna hai | File |
|---|---|
| Main page `/` (design) | `site/landing.html`, `site/landing.css`, `site/landing.js` |
| Main page ka default text aur feature cards | `site/_worker.mjs` mein `LANDING_TEXT` aur `LANDING_CARDS` (text badalne ke liye code ki zaroorat nahi: **Dev → 🏠 Landing**) |
| Dukaandar panel `/admin` | `site/admin.html`, `site/admin.js`, `site/admin.css` |
| Dev panel `/dev` | `site/dev.html`, `site/dev.js`, `site/dev.css` |
| Customer dukaan `/s/<link>` | `site/index.html`, `site/app.js`, `site/styles.css` |
| Order tracking / dukaan info | `site/track.html` + `track.js`, `site/info.html` |
| 3D intro animation | `site/splash.css`, `site/splash.js` |
| Server ka saara logic (API, database, login, billing, pages) | `site/_worker.mjs` |
| Notification (order alert) | `site/sw.js` |
| QR, stickers, app icon | `site/qr.js`, `site/stickers.js`, `site/appicon.js` |
| Deploy setting (Worker naam, database) | `wrangler.apnadhanda.toml` |
| Tests | `test/*.test.mjs` |
| Poori technical jaankari | `README.md` |

**Tip:** CSS ya JS file badlo to phone purani file dikha sakta hai. Usse bachne ke liye:
- `site/_worker.mjs` mein `APP_VERSION = "10.1.0"` ko aage badhao, jaise `"10.1.1"`.
- `.html` files mein jahan bhi `?v=10.1.0` likha hai, wahan bhi wahi naya number likho.
- VS Code mein **Ctrl + Shift + H** se sab files mein ek saath badal sakte ho.

## 6. Tests chalao (deploy se pehle hamesha)

```
npm test
```
- Aakhir mein `# fail 0` aana chahiye.
- Agar `fail 1` ya zyada aaye, to deploy mat karo. Pehle galti theek karo, ya file ko purane jaisa kar do.

## 7. Live karo (deploy)

Sirf ye command chalao:
```
npm run deploy
```
(Ye `npx wrangler deploy --config wrangler.apnadhanda.toml` chalata hai.)

- Output mein **"Uploaded apnadhanda"** aur `https://apnadhanda.krishpatil.workers.dev` dikhna chahiye.
- Check karo: https://apnadhanda.krishpatil.workers.dev/health kholo. Wahan `"version"` naya number dikhayega.
- ⚠️ Kabhi `--name kirana` mat likhna, aur kisi doosri config se deploy mat karna.
- Galti ho gayi? Cloudflare dashboard → **Workers & Pages → apnadhanda → Deployments** mein purane version pe **Rollback** dabao. Ek click mein purani site wapas aa jaayegi.

## 8. Database backup aur restore

**Backup** (hafte mein ek baar, aur bade badlaav se pehle zaroor):
```
npx wrangler d1 export kirana-db --remote --config wrangler.apnadhanda.toml --output backup.sql
```
(Short tareeka: `npm run backup`)

- Isse folder mein `backup.sql` ban jaayegi.
- Har baar naam badal ke rakho (jaise `backup-2026-10-25.sql`) aur Google Drive pe bhi copy rakho.
- Dev panel → Platform → **"Backup everything (JSON)"** bhi ek alag backup deta hai.

**Restore**, yaani galti ke baad wapas lana:
- **Aasaan tareeka, pichhle 7 din tak ke liye (Time Travel, free plan):**
  ```
  npx wrangler d1 time-travel restore kirana-db --timestamp=2026-10-25T10:00:00+05:30 --config wrangler.apnadhanda.toml
  ```
  Time wo likho jab sab theek tha. Isse poora database us time pe wapas chala jaata hai.
- **backup.sql file se:**
  - Ek naya database banao:
    ```
    npx wrangler d1 create kirana-db-restore
    ```
  - Usme file daalo:
    ```
    npx wrangler d1 execute kirana-db-restore --remote --file backup.sql
    ```
  - `wrangler.apnadhanda.toml` mein dono jagah `database_name` ko `kirana-db-restore` karo aur `database_id` mein naya ID daalo (create command ne jo diya tha). Phir `npm run deploy` karo.
  - Purane `kirana-db` mein seedha file daaloge to "table already exists" error aayega, isliye naya database banana hi safe hai.

## 9. Dev password badalna ya bhool jaana

Dev password Cloudflare database (D1, table `dev_accounts`) mein secure hash ke roop mein rakha hai, code mein nahi.
- **Badalna:** Dev panel → **Platform** → neeche **"Your account"** → current aur naya password (12+ letters) → **Change password**.
- **Bhool gaye:** `/dev` login pe **"Forgot password? Use the recovery key"** dabao, apni recovery key (`KD-…`) aur naya password daalo.
- **Password aur recovery key dono kho gaye (emergency):**
  - Ye chalao:
    ```
    npm run dev-password -- "Mera-Naya-Password-2026"
    ```
  - Ye ek lambi `npx wrangler d1 execute …` command dikhayega. Use copy karke terminal mein chalao.
  - Phir `krish-dev` aur naye password se login karo.
- Password aur recovery key kabhi WhatsApp/chat mein mat bhejna, aur is folder mein file bana ke mat rakhna.

## 10. Apna domain lagana (optional, baad mein)

1. Domain kharido (jaise `apnadhanda.in`). Iska paisa domain company leti hai, Worker free rehta hai.
2. Domain ko Cloudflare mein add karo: dashboard → **Add a domain**, aur jo nameservers wo bataye, domain company ki site pe daalo.
3. **Workers & Pages → apnadhanda → Settings → Domains & Routes → Add → Custom domain** → `apnadhanda.in` likho → Add.
4. `wrangler.apnadhanda.toml` mein `PUBLIC_ORIGIN = "https://apnadhanda.in"` karo aur `npm run deploy` karo, taaki dukaanon ke link/QR naye domain pe banen.
   - Purane QR (`workers.dev` wale) bhi chalte rahenge.

## 11. Chhoti checklist, har badlaav ke liye

1. Backup: `npm run backup`
2. File badlo aur `npm start` se laptop pe dekho
3. `npm test` chalao, aakhir mein `fail 0` aana chahiye
4. Version number badhao (CSS/JS badla ho to)
5. Live: `npm run deploy` (sirf apnadhanda!)
6. Phone pe site kholo aur check karo

Kuch atak jaaye to error ka screenshot Tab ko bhej do. 🙂
