const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function ensure() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }, null, 2));
  }
}

function readDB() {
  ensure();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(db) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getUser(email) {
  const db = readDB();
  return db.users[email] || null;
}

function saveUser(email, userObj) {
  const db = readDB();
  db.users[email] = userObj;
  writeDB(db);
  return userObj;
}

function allUsers() {
  const db = readDB();
  return Object.values(db.users);
}

module.exports = { readDB, writeDB, getUser, saveUser, allUsers };
