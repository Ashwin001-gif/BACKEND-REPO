import mongoose from 'mongoose';

const connectDB = async () => {
  if (process.env.NODE_ENV === 'test') {
    // For testing, we might want to connect to an in-memory DB or a specific test DB
    // To keep it simple, we will connect to a test database string
    const conn = await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zk-vault-test');
    console.log(`MongoDB Connected (Test): ${conn.connection.host}`);
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zk-vault');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
