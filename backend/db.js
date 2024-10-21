const odbc = require('odbc');

// Define your ODBC connection string
const connectionString = 'DSN=fec;UID=informix;PWD=informix;';

// Create a function to connect to the database
const pool = odbc.pool('DSN=fec');

async function queryDatabase(query) {
  try {
    const connection = await pool.acquire();
    const result = await connection.query(query);
    await pool.release(connection);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

module.exports = { queryDatabase };
