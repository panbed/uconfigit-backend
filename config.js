const path = require('path');

// UDOIT .env path, use the UDOIT_ENV_PATH variable if set, otherwise default to ../UDOIT/.env
const envPath = path.resolve(__dirname, process.env.UDOIT_ENV_PATH || '../.env');

module.exports = { envPath };