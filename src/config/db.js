const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facilities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      city VARCHAR(100),
      country VARCHAR(100),
      address TEXT,
      contact_email VARCHAR(255),
      contact_phone VARCHAR(20),
      description TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'donor',
      email_verified BOOLEAN DEFAULT false,
      facility_id INT REFERENCES facilities(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS needs (
      id SERIAL PRIMARY KEY,
      facility_id INT REFERENCES facilities(id) ON DELETE CASCADE,
      title VARCHAR(255),
      description TEXT,
      category VARCHAR(50),
      urgency VARCHAR(20) DEFAULT 'low',
      status VARCHAR(20) DEFAULT 'open',
      children_count INT,
      cash_equivalent NUMERIC(10,2),
      items JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      need_id INT REFERENCES needs(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      donor_name VARCHAR(255),
      donor_email VARCHAR(255),
      amount NUMERIC(10,2),
      payment_method VARCHAR(50) DEFAULT 'card',
      status VARCHAR(20) DEFAULT 'pending',
      transaction_ref VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fulfillments (
      id SERIAL PRIMARY KEY,
      need_id INT UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
      photo_url TEXT,
      caption TEXT,
      verified BOOLEAN DEFAULT false,
      submitted_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Database tables ready');
};

module.exports = { pool, initDB };