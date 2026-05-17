import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
} catch (e) {}

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'test-app');

try {
  const db = getFirestore(admin.app('test-app'), firebaseConfig.firestoreDatabaseId || undefined);
  console.log("DB configured with ID:", firebaseConfig.firestoreDatabaseId);
} catch(e) {
  console.error("Error with databaseId", e);
}
