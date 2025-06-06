# Gym Session Logger

Simple mobile-friendly web application to log gym workouts. Backend uses Node.js with SQLite storage.

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

The SQLite database file `gym.db` will be created automatically in the project directory.

## Docker
Build and run with Docker:
```bash
docker build -t gym-app .
docker run -p 3000:3000 gym-app
```

## Project structure
- `server.js` – Express backend and API
- `public/` – static frontend files
- `package.json` – dependencies and start script

