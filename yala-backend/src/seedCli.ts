import { openDb } from './db';
import { seedDemoStart } from './services/demoSeed';
import type { UserRow } from './auth';

const db = openDb();
db.prepare(`INSERT OR IGNORE INTO users (email,name,birth_date,weekly_allowance,data_mode,is_demo) VALUES ('diana.demo@yala.app','Diana Zuñiga','2010-03-14',60,'demo',1)`).run();
const u = db.prepare("SELECT * FROM users WHERE email='diana.demo@yala.app'").get() as UserRow;
seedDemoStart(db, u);
console.log('Demo lista: Diana Zuñiga (POST /api/auth/demo)');
