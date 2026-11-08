import { createApp } from './app';
import { config } from './config';
import { openDb } from './db';

const db = openDb();
createApp(db).listen(config.port, () => {
  console.log(`Yala API lista en http://localhost:${config.port}/api  (IA: ${config.aiMode}, demo: ${config.allowDemo})`);
});
