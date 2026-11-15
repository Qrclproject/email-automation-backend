import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { google } from 'googleapis';
import { createOAuth2Client } from '../services/googleAuthService';
import Campaign from '../models/Campaign';
import QRCode from 'qrcode';
import sharp from 'sharp';
import axios from 'axios';
import { uploadFileToMinio } from '../services/minioService';

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const replaceVariables = (text: string, data: Record<string, string>, mappings: Record<string, string>) => {
  let processed = text;
  Object.entries(mappings).forEach(([templateVar, csvColumn]) => {
    const value = data[csvColumn] || '';
    processed = processed.split(templateVar).join(value);
  });
  Object.keys(data).forEach(key => {
    const value = data[key] || '';
    processed = processed.split(`{{${key}}}`).join(value);
    processed = processed.split(`[${key}]`).join(value);
  });
  return processed;
};

export const emailWorker = new Worker(
  'email-sending',
  async (job) => {
    const { recipientData, subject, body, senderEmail, refreshToken, campaignId, variableMappings } = job.data;
    
    const toEmail = recipientData.email || recipientData['Email Address'] || recipientData['Email'] || recipientData['email address'] || recipientData['email'];
    
    if (!toEmail) throw new Error(`No email column mapped. Columns: ${Object.keys(recipientData).join(', ')}`);

    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) throw new Error('Campaign not found');

      let finalBody = replaceVariables(body, recipientData, variableMappings || {});
      const finalSubject = replaceVariables(subject, recipientData, variableMappings || {});

      // --- IMAGE COMPOSITING LOGIC ---
      if (campaign.template && campaign.template.imageUrl && campaign.template.qrPosition) {
        const template = campaign.template;
        
        // 1. Determine what data goes into the QR Code
        let qrPayload = 'https://qrcodeng.com';
        if (template.qrDataField && recipientData[template.qrDataField]) {
           qrPayload = recipientData[template.qrDataField];
        } else if (variableMappings[template.qrDataField]) {
           // If the design used a mapped variable for the QR
           qrPayload = recipientData[variableMappings[template.qrDataField]];
        }

        // 2. Download the background image
        const bgRes = await axios.get(template.imageUrl, { responseType: 'arraybuffer' });
        const bgBuffer = Buffer.from(bgRes.data, 'binary');

        // 3. Generate QR Code
        const qrBuffer = await QRCode.toBuffer(qrPayload, {
          width: Math.round(template.qrPosition.width),
          margin: 1,
          color: {
            dark: template.qrConfig?.dataColor || '#000000',
            light: template.qrConfig?.lightColor || '#ffffff'
          }
        });

        // 4. Merge them using Sharp
        const compositeBuffer = await sharp(bgBuffer)
          .composite([{
            input: qrBuffer,
            top: Math.round(template.qrPosition.y),
            left: Math.round(template.qrPosition.x)
          }])
          .png()
          .toBuffer();

        // 5. Upload merged image to MinIO
        const mergedFileName = `merged/${campaignId}-${toEmail}-${Date.now()}.png`;
        const finalImageUrl = await uploadFileToMinio(compositeBuffer, mergedFileName, 'image/png');

        // 6. Replace the background URL in the HTML body with the new merged image
        finalBody = finalBody.split(template.imageUrl).join(finalImageUrl);
      }
      // -------------------------------

      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const utf8Subject = `=?utf-8?B?${Buffer.from(finalSubject).toString('base64')}?=`;
      const messageParts = [
        `From: ${senderEmail}`,
        `To: ${toEmail}`,
        `Subject: ${utf8Subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        finalBody,
      ];
      const message = messageParts.join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });

      console.log(`✅ Sent to ${toEmail}`);

      const updatedCampaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $inc: { sentCount: 1 } },
        { returnDocument: 'after' }
      );

      if (updatedCampaign) {
        const total = updatedCampaign.recipients.length;
        const processed = (updatedCampaign.sentCount || 0) + (updatedCampaign.failedCount || 0);
        const progress = Math.round((processed / total) * 100);
        const status = processed >= total ? 'Completed' : 'Sending';

        await Campaign.findByIdAndUpdate(campaignId, { $set: { progress, status } });
        await Campaign.updateOne(
          { _id: campaignId, "recipients.data": recipientData },
          { $set: { "recipients.$.status": "Sent", "recipients.$.sentAt": new Date() } }
        );
      }

      return { success: true, email: toEmail };
    } catch (error: any) {
      console.error(`❌ Failed to send to ${toEmail}:`, error.message);
      
      const campaign = await Campaign.findById(campaignId);
      if (campaign) {
        const recipientIndex = campaign.recipients.findIndex(
          (r: any) => r.data === recipientData || r.data?.email === toEmail
        );
        
        if (recipientIndex !== -1) {
          campaign.recipients[recipientIndex].status = 'Failed';
          campaign.recipients[recipientIndex].error = error.message;
        }
        
        campaign.failedCount = (campaign.failedCount || 0) + 1;
        const total = campaign.recipients.length;
        const processed = (campaign.sentCount || 0) + campaign.failedCount;
        campaign.progress = Math.round((processed / total) * 100);
        if (processed >= total) campaign.status = 'Completed';

        await campaign.save();
      }

      throw error; 
    }
  },
  { 
    connection,
    limiter: { max: 5, duration: 5000 }
  }
);