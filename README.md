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
docker run -d -p 3000:3000 \
  -e SESSION_SECRET=$(grep SESSION_SECRET .env | cut -d '=' -f2) \
  -v ${PWD}/gym.db:/app/gym.db \
  --name boga-container \
  BoGa
```

## Project structure
- `server.js` – Express backend and API
- `public/` – static frontend files
- `package.json` – dependencies and start script

