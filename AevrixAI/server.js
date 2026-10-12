require('dotenv').config();
require('./server/main').start().catch(error => {
  const code = typeof error.code === 'string' && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : 'configuration_error';
  let hint = 'Check configuration and database connectivity.';
  if (code === 'backup_required') hint = 'Verify the legacy database backup before enabling LEGACY_BACKUP_CONFIRMED.';
  else if (error.message?.startsWith('Set JWT_SECRET')) hint = 'JWT_SECRET must contain at least 32 bytes when DATABASE_URL is set.';
  else if (error.message?.includes('PUBLIC_ORIGIN')) hint = 'PUBLIC_ORIGIN must be the HTTPS address of this service.';
  console.error(JSON.stringify({event:'startup_failed',code,hint}));
  process.exitCode = 1;
});
