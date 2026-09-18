const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || './data/database.json';

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const adapter = new FileSync(DB_PATH, {
      serialize: (obj) => JSON.stringify(obj, null, 2),
      deserialize: (str) => JSON.parse(str),
    });

    db = low(adapter);

    db.defaults({
      users: [],
      jobs: [],
      import_rows: [],
    }).write();
  }
  return db;
}

function initDatabase() {
  getDb();
  console.log('Database initialized');
}

function generateId() {
  return require('uuid').v4();
}

module.exports = { getDb, initDatabase, generateId };
