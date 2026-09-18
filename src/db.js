const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || './data/database.json';

let data = { users: [], jobs: [], import_rows: [] };
let loaded = false;

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  if (loaded) return;
  ensureDir();
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      data = JSON.parse(raw);
    }
  } catch {
    data = { users: [], jobs: [], import_rows: [] };
  }
  if (!data.users) data.users = [];
  if (!data.jobs) data.jobs = [];
  if (!data.import_rows) data.import_rows = [];
  loaded = true;
}

function save() {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getCollection(name) {
  load();
  return data[name];
}

function persist() {
  save();
}

function getDb() {
  load();
  return {
    users: data.users,
    jobs: data.jobs,
    import_rows: data.import_rows,
    persist,
  };
}

function initDatabase() {
  load();
  persist();
  console.log('Database initialized');
}

function generateId() {
  return require('uuid').v4();
}

module.exports = { getDb, initDatabase, generateId };
