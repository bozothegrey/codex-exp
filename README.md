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
docker build -t boga . `
```
```bash
docker run -d -p 3000:3000 `
  -e SESSION_SECRET=$env:SESSION_SECRET `
  -v ${PWD}/gym.db:/app/gym.db `
  --name boga-container `
  boga
```
### Tag your image
```bash
docker tag boga gcr.io/boga-465619/boga:latest
```
### Push to GCR
```bash
docker push gcr.io/boga-465619/boga:latest
```
## Deploy to GCloud run
```bash
gcloud run deploy boga `
  --image gcr.io/boga-465619/boga:latest `
  --platform managed `
  --port 3000 `
  --region europe-west1 `
  --allow-unauthenticated `
  --timeout 300s `
  --set-env-vars "SESSION_SECRET=$env:SESSION_SECRET" `
  --set-env-vars "NODE_ENV=$env:NODE_ENV"
  --set-env-vars "DB_PATH=./gym.db"
```
## Deploy with db mount
```bash
gcloud run deploy boga `
  --image gcr.io/boga-465619/boga:latest `
  --platform managed `
  --port 3000 `
  --region europe-west1 `
  --allow-unauthenticated `
  --timeout 300s `
  --add-volume "name=gcsvolume,type=cloud-storage,bucket=$env:GCS_BUCKET_NAME" `
  --add-volume-mount "volume=gcsvolume,mount-path=$env:GCS_MNT_PATH" `
  --set-env-vars "SESSION_SECRET=$env:SESSION_SECRET" `
  --set-env-vars "NODE_ENV=$env:NODE_ENV" `
  --set-env-vars "DB_PATH=$env:DB_PATH"
```


## Project structure
- `server.js` – Express backend and API
- `public/` – static frontend files
- `package.json` – dependencies and start script

