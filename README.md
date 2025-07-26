# Gym Session Logger

Simple mobile-friendly web application to log gym workouts. Each session can contain multiple exercises and sets, stored in a SQLite database.

## Prerequisites
- Node.js 16+
- npm

## Running locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in your browser.

Log in using one of the predefined users:
* **ema** / **ghisa**
* **SBP** / **ghisa**
* **dino** / **ghisa**

The SQLite database file `gym.db` will be created automatically in the project directory.

## Docker

Import .env.prod
...

Build and run with Docker:
```bash
docker build -t boga .
```

##export vars
```bash
Get-Content .\.env.prod | ForEach-Object { $key, $value = $_.Split('=', 2); Set-Item -Path "env:$key" -Value $value }
```


### Local deployment
```bash
docker run -d -p 3000:3000 `
  -e SESSION_SECRET=$env:SESSION_SECRET `
  -v ${PWD}/gym.db:/app/gym.db `
  --name boga-container `
  boga
```
### Tag your image

```bash
$TAG = (Get-Date -Format 'yyyyMMdd')
docker tag boga "gcr.io/boga-465619/boga:$TAG"
```
### Push to GCR
```bash
docker push "gcr.io/boga-465619/boga:$TAG"
```



## Deploy to GCloud run
```bash
gcloud run deploy boga `
  --image "gcr.io/boga-465619/boga:$TAG" `
  --platform managed `
  --port 3000 `
  --region europe-west1 `
  --allow-unauthenticated `
  --timeout 300s `
  --set-env-vars --set-env-vars "SESSION_SECRET=$env:SESSION_SECRET,NODE_ENV=$env:NODE_ENV,DB_PATH=$env:DB_PATH"
```
## Deploy with db mount
```bash
gcloud run deploy boga `
  --image "gcr.io/boga-465619/boga:$TAG" `
  --platform managed `
  --port 3000 `
  --region europe-west1 `
  --allow-unauthenticated `
  --timeout 300s `
  --add-volume "name=gcsvolume,type=cloud-storage,bucket=boga-db-20250712" `
  --add-volume-mount "volume=gcsvolume,mount-path=/mnt/gcs" `
  --set-env-vars "SESSION_SECRET=$env:SESSION_SECRET,NODE_ENV=$env:NODE_ENV,DB_PATH=$env:DB_PATH"
```


## Project structure
- `server.js` – Express backend and API
- `public/` – static frontend files
- `package.json` – dependencies and start script

## Reusable Sidebar Component

A reusable sidebar is implemented as a Web Component. The sidebar HTML is defined in `public/components/sidebar.html` and injected via the `<app-sidebar></app-sidebar>` custom element.

The sidebar contains:
- Follow Users section with search functionality
- Notifications section with real-time updates
- Challenges Received section with filters
- Challenges Given section with filters

### Implementation Details

The sidebar component (`public/components/sidebar.js`) is self-contained and includes all necessary logic:
- **User Search**: Find and follow users functionality
- **Follow Management**: Display followed users with unfollow capability
- **Notifications**: Real-time notifications with certify/challenge actions
- **Challenges**: Display and filter challenges with polling updates

### Usage

1. Add `<app-sidebar></app-sidebar>` where you want the sidebar to appear in your HTML.
2. Ensure you include the script: `<script src="components/sidebar.js"></script>` before your page's main JS.
3. To update the sidebar, edit only `public/components/sidebar.html`.

### Example
```html
<app-sidebar></app-sidebar>
<script src="components/sidebar.js"></script>
```

