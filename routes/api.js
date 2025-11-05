let express = require('express');
const { default: isDocker } = require('is-docker');
let mysql = require('mysql2/promise')
let router = express.Router();
const { envPath } = require('../config');

// TODO: use env or setup database for admin app secrets
const fs = require('fs');
function getDbConnectionString() {
    if (process.env.UDOIT_ENV_PATH) {
        try {
            const envFile = fs.readFileSync(process.env.UDOIT_ENV_PATH, 'utf-8');
            const match = envFile.match(/^DATABASE_URL=(.*)$/m);
            if (match) {
                console.log(match[1].trim())
                return match[1].trim();
            }
        } catch (e) {
            console.error('Failed to read UDOIT_ENV_PATH for DATABASE_URL:', e);
        }
    }
    return process.env.DATABASE_URL;
}

const required_tables = [
    'content_item', 
    'course', 
    'file_item', 
    'institution',
    'issue',
    'log_entry',
    'messenger_messages',
    'migration_versions',
    'report',
    'user_session',
    'users'
]

// ANCHOR: database (MySQL) connection endpoints

// test MySQL connection
router.get('/mysql/test', async function(req, res, next) {
    try {
        const connection = await mysql.createConnection(getDbConnectionString());
        await connection.connect();
        res.status(200).send('Connected to MySQL');
    } catch (err) {
        console.error('Error connecting to MySQL:', err);
        res.status(500).send('Unable to connect to MySQL!');
    }
});

// check if required tables exist
router.get('/mysql/check-tables', async function(req, res, next) {
    try {
        const connection = await mysql.createConnection(getDbConnectionString());
        await connection.connect();

        // get all tables in database
        const [rows, fields] = await connection.execute("SHOW TABLES");
        // rows is an array of objects w/ table names as values, so map the table names into an array
        const existing_tables = rows.map(row => Object.values(row)[0]);
        // filter out all tables from required_tables that 
        const missing_tables = required_tables.filter(table => !existing_tables.includes(table));

        // send array, if empty then we have all tables
        res.status(200).send(missing_tables)

    } catch (err) {
        console.error('Error checking tables:', err);
        res.status(500).send('Error checking tables!');
    }
});

// run migrations for mysql using shell and docker
router.post('/mysql/migrate', async function(req, res, next) {
    try {
        const { exec } = require('child_process');
        exec('docker exec -i udoit-web php bin/console --no-interaction doctrine:migrations:migrate', (error, stdout, stderr) => {
            if (error) {
                console.error('Error running migrations:', error);
                return res.status(500).send('Error running migrations!');
            }
            console.log('Migrations output:', stdout);
            res.status(200).send('Migrations completed successfully!');
        });
    } catch (err) {
        console.error('Error running migrations:', err);
        res.status(500).send('Error running migrations!');
    }
});

// add institution data to institution table
router.post('/mysql/add-institution', async function(req, res, next) {
    const { title, lms_domain, lms_id, lms_account_id, status, vanity_url, metadata, api_client_id, api_client_secret } = req.body;

    /* TODO: type checking and validation, below is the mysql db schema
        title: varchar(255)
        lms_domain: varchar(255)
        lms_id: varchar(64)
        lms_account_id: varchar(255)
        created: datetime
        status: tinyint(1)
        vanity_url: varchar(255)
        metadata: longtext
        api_client_id: varchar(255)
        api_client_secret: varchar(255)
    */

    if (!title || !lms_domain || !lms_id || !lms_account_id || !status || !vanity_url || !api_client_id || !api_client_secret) {
        return res.status(400).send('Missing required fields');
    }

    try {
        const connection = await mysql.createConnection(getDbConnectionString());
        await connection.connect();

        let values = [title, lms_domain, lms_id, lms_account_id, new Date(), status, vanity_url, metadata || '{}', api_client_id, api_client_secret]

        const [result] = await connection.execute(
            "INSERT INTO institution (title, lms_domain, lms_id, lms_account_id, created, status, vanity_url, metadata, api_client_id, api_client_secret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            values
        );

        res.status(201).send({ id: result.insertId });
    } catch (err) {
        console.error('Error adding institution:', err);
        res.status(500).send('An error occurred while adding institution!');
    }
});

// ANCHOR: modifying .env file endpoints

// get all current env variables
// TODO: this is insecure
router.get('/env', function(req, res, next) {
    let envConfig = require('fs').readFileSync(envPath, 'utf-8');

    // return value of DATABASE_URL, BASE_URL, JWK_BASE_URL, APP_SECRET only
    const keysToGet = ['DATABASE_URL', 'BASE_URL', 'JWK_BASE_URL', 'APP_SECRET'];
    let result = {};
    keysToGet.forEach(key => {
        const regex = new RegExp(`^${key}=(.*)$`, 'm');
        const match = envConfig.match(regex);
        if (match) {
            result[key] = match[1];
        }
    });

    res.status(200).send(result);
});

// update an env variable
router.post('/env', function(req, res, next) {
    const { key, value } = req.body;

    if (!key || !value) {
        return res.status(400).send('Missing key or value');
    }

    // only allow certain keys to be updated
    const allowedKeys = ['DATABASE_URL', 'BASE_URL', 'JWK_BASE_URL', 'APP_SECRET'];
    if (!allowedKeys.includes(key)) {
        return res.status(400).send('Key not allowed to be updated');
    }
    
    // update .env file
    const fs = require('fs');
    
    // check if envPath exists
    if (!fs.existsSync(envPath)) {
        console.log(envPath)
        // TODO: maybe remove the path later
        return res.status(500).send('Could not find environment file at path: ' + envPath);
    }

    let envConfig = fs.readFileSync(envPath, 'utf-8');
    
    
    // check if key exists, if so replace it, otherwise add it
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envConfig)) {
        envConfig = envConfig.replace(regex, `${key}=${value}`);
    } else {
        envConfig += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envConfig);

    // once file is updated, re-read the file and check for the updated value
    let updatedConfig = fs.readFileSync(envPath, 'utf-8');
    const updatedRegex = new RegExp(`^${key}=(.*)$`, 'm');
    const match = updatedConfig.match(updatedRegex);
    if (!match || match[1] !== value) {
        return res.status(500).send('Failed to update environment variable');
    }

    // if we made it here, the update was successful
    console.log(`Updated ${key} in ${envPath}`);

    res.status(200).send({key, value});
});

// ANCHOR: docker endpoints

// check if we're running in a docker container
router.get('/docker/test', function(req, res, next) {
    console.log('isDocker:', isDocker());
    res.json({ docker: isDocker() });
});

// restart udoit-web docker container
router.post('/docker/restart-udoit-web', function(req, res, next) {
    try {
        const { exec } = require('child_process');
        exec('docker restart udoit-web', (error, stdout, stderr) => {
            if (error) {
                console.error('Error restarting udoit-web container:', error);
                return res.status(500).send('Error restarting udoit-web container!');
            }

            res.status(200).send('udoit-web container restarted successfully!');
        });
    } catch (err) {
        console.error('Error restarting udoit-web container:', err);
        res.status(500).send('Error restarting udoit-web container!');
    }
});

module.exports = router;