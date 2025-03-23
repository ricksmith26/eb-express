import mongoose from 'mongoose';
import {MONGO_DB_URL} from './vars.js'

const connectDB = async () => {
    console.log(MONGO_DB_URL, '<<<')
    mongoose.connect(MONGO_DB_URL)
        .then(() => console.log('✅ MongoDB connected successfully'))
        .catch((err) => console.error('❌ MongoDB connection error:', err));
};

export default connectDB;