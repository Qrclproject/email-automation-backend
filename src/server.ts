import 'dotenv/config';
import app from './app';
import { connectDB } from './config/db';
import cron from 'node-cron';
import Account from './models/Account';

// Import the worker to start it in the background
import './workers/emailWorker'; 

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();

  // Schedule a job to run at midnight every day (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    try {
      await Account.updateMany({}, { $set: { sentToday: 0 } });
      console.log('🕛 Daily email quotas reset to 0');
    } catch (error) {
      console.error('❌ Failed to reset daily quotas:', error);
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
};

startServer();