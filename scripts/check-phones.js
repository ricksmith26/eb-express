import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});

await mongoose.connect(process.env.MONGO_DB_URL);

const patients = await mongoose.connection.db.collection('Patient').find({
  'telecom.value': { $regex: '7939043476' }
}).toArray();

console.log('Patients with phone containing 7939043476:');
console.log(JSON.stringify(patients, null, 2));

// Also show all patients with any phone
const allWithPhone = await mongoose.connection.db.collection('Patient').find({
  'telecom.system': 'phone'
}).toArray();

console.log('\n\nAll patients with phone numbers:');
allWithPhone.forEach(p => {
  const phones = p.telecom?.filter(t => t.system === 'phone') || [];
  console.log(p.name?.[0]?.given?.[0], p.name?.[0]?.family, '-', phones.map(t => t.value).join(', '));
});

await mongoose.disconnect();
