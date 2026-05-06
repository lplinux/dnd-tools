#!/usr/bin/env node
/**
 * npm run setup-db
 *
 * Phase A (--db-only):
 *   Connect to the PostgreSQL server and create the `dndtools` database
 *   if it does not already exist.
 *
 * Phase B (default, no flag):
 *   Do Phase A, then connect to `dndtools` and create an `admin` user
 *   with a random password if no admin accounts exist yet.
 *
 * run.sh calls this twice:
 *   1. `node scripts/setup-db.js --db-only`  — after postgres is healthy
 *   2. `node scripts/setup-db.js`             — after the app is healthy
 *      (app.js runs initializeDatabase() on startup, which creates all tables)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_ONLY = process.argv.includes('--db-only');

// ── .env loader ───────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  });
}

const { Client, Pool } = require('pg');
const bcrypt = require('bcryptjs');

const dbName = process.env.DB_NAME || 'dndtools';
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const user = process.env.DB_USER || 'dndtools';
const password = process.env.DB_PASSWORD || 'dndtools123';

// Maintenance connection (postgres DB) for CREATE DATABASE
const maintenanceConnStr = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
  : null;

// App DB pool
const appPool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host, port, user, password, database: dbName }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomPassword() {
  return crypto.randomBytes(14).toString('base64url');
}

function box(lines) {
  const width = Math.max(...lines.map(l => l.length)) + 4;
  const hr = '\u2550'.repeat(width);
  console.log('\n  \u2554' + hr + '\u2557');
  lines.forEach(l => {
    const pad = ' '.repeat(width - l.length - 2);
    console.log('  \u2551  ' + l + pad + '\u2551');
  });
  console.log('  \u255a' + hr + '\u255d\n');
}

// ── Phase A: create database ──────────────────────────────────────────────────
async function ensureDatabase() {
  const client = maintenanceConnStr
    ? new Client({ connectionString: maintenanceConnStr })
    : new Client({ host, port, user, password, database: 'postgres' });

  try {
    await client.connect();
    console.log(`  \u2713  Connected to PostgreSQL at ${host}:${port}`);
  } catch (e) {
    console.error(`  \u2717  Cannot connect to PostgreSQL: ${e.message}`);
    process.exit(1);
  }

  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length) {
      console.log(`  \u2713  Database "${dbName}" already exists`);
    } else {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`  \u2705  Database "${dbName}" created`);
    }
  } finally {
    await client.end();
  }
}

// ── Phase B: create initial admin ─────────────────────────────────────────────
async function ensureAdminUser() {
  // Confirm users table exists (created by app.js initializeDatabase on first start)
  try {
    await appPool.query('SELECT 1 FROM users LIMIT 1');
  } catch (e) {
    if (e.message.includes('does not exist')) {
      console.error('  \u2717  users table not found.');
      console.error('     This should not happen — the app must be healthy before this step.');
      process.exit(1);
    }
    throw e;
  }

  const { rows: existing } = await appPool.query("SELECT username FROM users WHERE role = 'admin'");
  if (existing.length) {
    console.log(`  \u2713  Admin account(s) exist: ${existing.map(r => r.username).join(', ')}`);
    return;
  }

  // Create admin with random password
  const adminUser = 'admin';
  const adminPass = randomPassword();
  const hash = await bcrypt.hash(adminPass, 12);
  await appPool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
    [adminUser, hash]
  );
  console.log('  \u2705  Initial admin user created');

  // Write to tmpfile so run.sh can show it in the final banner
  const credsPath = '/tmp/dndtools-init-creds.txt';
  fs.writeFileSync(credsPath, `${adminUser}\n${adminPass}\n`, { mode: 0o600 });

  box([
    '\uD83D\uDD11  Initial admin account created',
    '',
    `  Username : ${adminUser}`,
    `  Password : ${adminPass}`,
    '',
    '  \u26A0  Save this — it will not be shown again',
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\uD83C\uDFB2 D&D Tools \u2014 ' + (DB_ONLY ? 'Database Init' : 'Setup') + '\n');
  await ensureDatabase();
  if (!DB_ONLY) {
    await ensureAdminUser();
    await appPool.end();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
