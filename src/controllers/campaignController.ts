import { Request, Response } from 'express';
import Campaign from '../models/Campaign';
import Account from '../models/Account';
import { addEmailsToQueue } from '../services/queueService';

export const getCampaigns = async (req: Request, res: Response) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCampaignById = async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    res.json(campaign);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const { senderAccount, recipients, subject, emailBody, variableMappings } = req.body;
    
    const newCampaign = await Campaign.create({
      ...req.body,
      sentCount: 0,
      failedCount: 0,
      progress: 0
    });

    const account = await Account.findOne({ email: senderAccount });
    
    if (account && account.refreshToken) {
      await addEmailsToQueue(
        newCampaign._id.toString(),
        recipients,
        subject,
        emailBody,
        account.email,
        account.refreshToken,
        variableMappings || {}
      );
    } else {
      console.log('⚠️ Account not found or missing refresh token. Emails not queued.');
    }

    res.status(201).json(newCampaign);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCampaign = async (req: Request, res: Response) => {
  try {
    const updated = await Campaign.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  try {
    await Campaign.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Campaign deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// --- NEW CHECK-IN FUNCTION ---
export const checkInAttendee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scannedValue } = req.body;

    if (!scannedValue) {
      return res.status(400).json({ message: 'No scanned value provided' });
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Find the recipient that matches the scanned value in ANY of their data fields
    const recipientIndex = campaign.recipients.findIndex((r: any) => {
      return Object.values(r.data).some(
        (val) => String(val).trim().toLowerCase() === scannedValue.trim().toLowerCase()
      );
    });

    if (recipientIndex === -1) {
      return res.status(404).json({ message: 'Attendee not found. Invalid ticket.' });
    }

    const recipient = campaign.recipients[recipientIndex];

    // Check if they are already checked in
    if (recipient.checkedIn) {
      return res.status(400).json({ 
        message: 'Already checked in', 
        attendee: recipient.data,
        checkedInAt: recipient.checkedInAt
      });
    }

    // Mark as checked in
    campaign.recipients[recipientIndex].checkedIn = true;
    campaign.recipients[recipientIndex].checkedInAt = new Date();

    // Mongoose needs to know the Mixed array changed
    campaign.markModified('recipients');
    await campaign.save();

    res.status(200).json({ 
      message: 'Check-in successful', 
      attendee: recipient.data,
      checkedInAt: campaign.recipients[recipientIndex].checkedInAt
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};