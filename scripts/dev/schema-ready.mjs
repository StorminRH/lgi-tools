import { writeFileSync } from 'node:fs';
writeFileSync(process.env.LGI_SCHEMA_READY_FILE, 'ready\n', { mode: 0o600 });
setInterval(() => {}, 60000);
