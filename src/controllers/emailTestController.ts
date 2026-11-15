import { Request, Response } from 'express';
import { sendEmail } from '../services/emailService';
import Account from '../models/Account';

export const sendTestEmail = async (req: Request, res: Response) => {
  try {
    const { accountId, to, subject, body } = req.body;

    if (!accountId || !to || !subject || !body) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const result = await sendEmail(accountId, to, subject, body);
    
    // Update sentToday count in DB
    await Account.findByIdAndUpdate(accountId, { $inc: { sentToday: 1 } });

    res.status(200).json({ 
      message: 'Email sent successfully!', 
      data: result 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};