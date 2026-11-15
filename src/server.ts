import 'dotenv/config';
import app from './app';
import { connectDB } from './config/db';

// Import the worker to start it in the background
import './workers/emailWorker'; 

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
};

startServer();