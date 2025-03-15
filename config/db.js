import mongoose from 'mongoose';

const connectDB = async () => {
    const mongoURI = 'mongodb+srv://rsmith:pass@testaifhir.sqrme.mongodb.net/?retryWrites=true&w=majority&appName=testAiFhir';

    mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => console.log('✅ MongoDB connected successfully'))
        .catch((err) => console.error('❌ MongoDB connection error:', err));
};

export default connectDB;