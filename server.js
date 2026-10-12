require('dotenv').config(); require('./server/main').start().catch(() => { console.error('Startup failed: check configuration and database.'); process.exitCode = 1; });
