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
* **emanuele** / **ghisa**
* **SBP** / **ghisa**
* **dino** / **ghisa**

The SQLite database file `gym.db` will be created automatically in the project directory.

## Docker
Build and run with Docker:
```bash
docker build -t boga .
$env:SESSION_SECRET = (Get-Content .env | Select-String "SECRET_KEY").Line.Split('=')[1].Trim()
docker run -d -p 3000:3000 `
  -e SESSION_SECRET=$env:SESSION_SECRET `
  -v ${PWD}/gym.db:/app/gym.db `
  --name boga-container `
  boga
```
latest

## Deploy to GCloud run
### Tag your image
```bash
docker tag boga gcr.io/boga-465619/boga:latest
```
### Push to GCR
```bash
docker push gcr.io/boga-465619/boga:
gcloud run deploy boga `
  --image gcr.io/boga-465619/boga:latest `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --set-env-vars "NODE_ENV=production" `
  --port 3000 `
  --timeout 300s `
  --set-env-vars "SESSION_SECRET=$env:SESSION_SECRET"
```
## Project structure
- `server.js` – Express backend and API
- `public/` – static frontend files
- `package.json` – dependencies and start script

