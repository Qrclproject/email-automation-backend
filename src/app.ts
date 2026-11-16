import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import designRoutes from './routes/designRoutes';
import campaignRoutes from './routes/campaignRoutes';
import accountRoutes from './routes/accountRoutes';

const app = express();

// UPDATE THIS LINE to accept your live frontend
app.use(cors({ 
  origin: ['http://localhost:5173', 'https://automate.qrcodeng.com'], 
  credentials: true 
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/accounts', accountRoutes);

export default app;