/**
 * Cleanup script for invalid device connection records
 * Removes Pi device connections that have no deviceId (created via wrong event)
 *
 * Usage: node scripts/cleanup-invalid-connections.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGO_DB_URL;

async function cleanup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    const db = mongoose.connection.db;
    const collection = db.collection('fhirdeviceconnections');

    // Find invalid Pi connections (have brigid-pi type but no deviceId)
    const invalidRecords = await collection.find({
      'deviceType.coding.code': 'brigid-pi',
      $or: [
        { 'device.deviceId': { $exists: false } },
        { 'device.deviceId': null },
        { 'device.deviceId': '' }
      ]
    }).toArray();

    console.log(`Found ${invalidRecords.length} invalid Pi connection record(s):\n`);

    for (const record of invalidRecords) {
      console.log(`  ID: ${record.id}`);
      console.log(`  Email: ${record.subject?.email || 'N/A'}`);
      console.log(`  DeviceId: ${record.device?.deviceId || 'MISSING'}`);
      console.log(`  Status: ${record.status}`);
      console.log('');
    }

    if (invalidRecords.length === 0) {
      console.log('No invalid connection records to delete.');
    } else {
      // Delete invalid records
      const result = await collection.deleteMany({
        'deviceType.coding.code': 'brigid-pi',
        $or: [
          { 'device.deviceId': { $exists: false } },
          { 'device.deviceId': null },
          { 'device.deviceId': '' }
        ]
      });
      console.log(`Deleted ${result.deletedCount} invalid connection record(s).`);
    }

    // Also clean up test devices from FhirDevice collection
    console.log('\n--- Cleaning up test devices ---\n');
    const deviceCollection = db.collection('fhirdevices');

    const testDevices = await deviceCollection.find({
      $or: [
        { 'identifier.value': /^TEST/i },
        { 'identifier.value': /test/i }
      ]
    }).toArray();

    console.log(`Found ${testDevices.length} test device(s):\n`);
    for (const device of testDevices) {
      const fingerprint = device.identifier?.find(i => i.system === 'urn:brigid:device:fingerprint')?.value;
      console.log(`  Name: ${device.name || 'N/A'}`);
      console.log(`  Fingerprint: ${fingerprint || 'N/A'}`);
      console.log(`  Status: ${device.status}`);
      console.log('');
    }

    if (testDevices.length > 0) {
      const deviceResult = await deviceCollection.deleteMany({
        $or: [
          { 'identifier.value': /^TEST/i },
          { 'identifier.value': /test/i }
        ]
      });
      console.log(`Deleted ${deviceResult.deletedCount} test device(s).`);
    }

    await mongoose.disconnect();
    console.log('\nDone.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanup();
