#!/usr/bin/env node
/**
 * npm run create-admin
 *
 * Interactively creates an admin user in the dndtools database.
 * Safe to run multiple times — will not overwrite an existing username.
 *
 * Reads connection details from environment variables (or a .env file).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Load .env if present (same logic as app.js so no extra dep needed)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
}

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'dndtools',
  password: process.env.DB_PASSWORD || 'dndtools123',
  database: process.env.DB_NAME || 'dndtools',
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

// Hide typed password (like sudo/ssh). Reuses the single `rl` interface above —
// creating a second readline on the same stdin makes the original echo the
// keystrokes unmuted, leaking the password. Here we mute `rl`'s own output for
// the duration of the question and restore it afterwards.
function askPassword(prompt) {
  return new Promise(resolve => {
    const original = rl._writeToOutput.bind(rl);
    let promptShown = false;
    rl._writeToOutput = function (str) {
      // Write the prompt exactly once; silence everything typed afterwards
      // (characters and full-line refreshes alike).
      if (!promptShown) { original(prompt); promptShown = true; }
    };
    rl.question(prompt, answer => {
      rl._writeToOutput = original;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n🎲 D&D Tools — Create Admin User\n');

  // Verify DB connection
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('❌  Cannot connect to the database:', e.message);
    console.error('   Make sure the app (or Docker Compose) is running and DATABASE_URL / DB_* vars are set.');
    process.exit(1);
  }

  // Show existing admins
  const { rows: existing } = await pool.query(
    "SELECT username FROM users WHERE role = 'admin' ORDER BY created_at"
  );
  if (existing.length) {
    console.log('ℹ️  Existing admin accounts:', existing.map(r => r.username).join(', '), '\n');
  } else {
    console.log('ℹ️  No admin accounts exist yet.\n');
  }

  // Gather input
  const username = (await ask('Username: ')).trim();
  if (!username) { console.error('❌  Username cannot be empty.'); process.exit(1); }

  // Check for duplicate
  const { rows: dup } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (dup.length) {
    console.error(`❌  Username "${username}" already exists.`);
    process.exit(1);
  }

  const password = await askPassword('Password: ');
  if (password.length < 8) {
    console.error('❌  Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirm = await askPassword('Confirm password: ');
  if (password !== confirm) {
    console.error('❌  Passwords do not match.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id, username, role",
    [username, hash]
  );

  console.log(`\n✅  Admin user created: ${user.username} (id=${user.id})\n`);
  rl.close();
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
