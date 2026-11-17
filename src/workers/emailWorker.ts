import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { google } from 'googleapis';
import { createOAuth2Client } from '../services/googleAuthService';
import Campaign from '../models/Campaign';
import Account from '../models/Account'; // <-- Added missing import
import QRCode from 'qrcode';
import sharp from 'sharp';
import axios from 'axios';
import { uploadFileToMinio } from '../services/minioService';

const connection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
});

const replaceVariables = (
  text: string,
  data: Record<string, string>,
  mappings: Record<string, string>
) => {
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

// Generic fallbacks used after the real font name
const fontFallbacks: Record<string, string> = {
  'Montserrat': 'Arial, sans-serif',
  'Inter': 'Arial, sans-serif',
  'Playfair Display': "'Times New Roman', serif",
  'Roboto': 'Arial, sans-serif',
  'Lora': 'Georgia, serif',
  'Oswald': 'Arial, sans-serif',
  'Dancing Script': 'cursive',
  'Cinzel': "'Times New Roman', serif",
  'Arial': 'Arial, sans-serif',
  'Georgia': 'Georgia, serif',
  'Courier New': "'Courier New', monospace",
  'Times New Roman': "'Times New Roman', serif",
};

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Word-wrap using an approximate character width (librsvg can't measure text)
const wrapText = (text: string, maxWidth: number, fontSize: number, bold: boolean): string[] => {
  const charWidth = fontSize * (bold ? 0.6 : 0.55);
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const generateTextSvg = (text: string, style: any, width: number, height: number) => {
  // Remove emojis/special chars that have no glyphs
  let cleanText = text.replace(/[^\x20-\x7E\u00A0-\u024F]/g, '');

  // Match the editor's text-transform
  if (style.textTransform === 'uppercase') cleanText = cleanText.toUpperCase();
  else if (style.textTransform === 'lowercase') cleanText = cleanText.toLowerCase();
  else if (style.textTransform === 'capitalize') cleanText = cleanText.replace(/\b\w/g, c => c.toUpperCase());

  const fontWeight = style.bold ? 'bold' : 'normal';
  const fontStyle = style.italic ? 'italic' : 'normal';
  const fontSize = style.fontSize || 24;
  const lineHeight = (style.lineHeight || 1.4) * fontSize;
  const color = style.color || '#000000';
  const alignment = style.alignment || 'center';

  // Real font name first (installed on the server), generic fallback after
  const safeName = String(style.fontFamily || 'Arial').replace(/[^\w \-]/g, '');
  const fontFamily = `'${safeName}', ${fontFallbacks[safeName] || 'Arial, sans-serif'}`;

  // Padding matches the editor's p-1 (4px)
  const pad = 4;
  let textAnchor = 'middle';
  let x = width / 2;
  if (alignment === 'left') { textAnchor = 'start'; x = pad; }
  if (alignment === 'right') { textAnchor = 'end'; x = width - pad; }

  const bgColor = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : null;
  const bgRect = bgColor ? `<rect width="${width}" height="${height}" fill="${bgColor}" />` : '';

  // Wrap and clip lines to the box, like the editor does
  const lines = wrapText(cleanText, width - pad * 2, fontSize, !!style.bold);
  const tspans = lines
    .map((line, i) => ({ line, baseline: pad + i * lineHeight + fontSize * 0.85 }))
    .filter(l => l.baseline <= height)
    .map(l => `<tspan x="${x}" y="${l.baseline}">${escapeXml(l.line)}</tspan>`)
    .join('');

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${bgRect}
      <text
        text-anchor="${textAnchor}"
        font-family="${fontFamily}"
        font-size="${fontSize}"
        fill="${color}"
        font-weight="${fontWeight}"
        font-style="${fontStyle}">${tspans}</text>
    </svg>
  `);
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

        // 1. Download background image
        const bgRes = await axios.get(template.imageUrl, { responseType: 'arraybuffer' });
        const bgBuffer = Buffer.from(bgRes.data, 'binary');

        const compositeLayers: sharp.OverlayOptions[] = [];

        // 2. Generate and Add QR Code (WITH SMART FALLBACKS)
        let qrPayload = 'https://qrcodeng.com';

        if (template.qrDataField) {
          // Try to resolve the variable using the mappings first
          let resolved = replaceVariables(template.qrDataField, recipientData, variableMappings || {});

          // If it still contains brackets, the user forgot to map it in Step 3.
          // Try to find a matching column automatically.
          if (resolved.includes('{{') || resolved.includes('[')) {
            const cleanFieldName = template.qrDataField.replace(/[{}\[\]]/g, '').trim();

            if (recipientData[cleanFieldName]) {
              resolved = recipientData[cleanFieldName];
            } else if (recipientData[cleanFieldName.toLowerCase()]) {
              resolved = recipientData[cleanFieldName.toLowerCase()];
            } else if (cleanFieldName.toLowerCase().includes('email')) {
              resolved = recipientData['email'] || recipientData['Email'] || recipientData['Email Address'] || 'https://qrcodeng.com';
            } else if (cleanFieldName.toLowerCase().includes('name')) {
              resolved = recipientData['Full Name'] || recipientData['Name'] || recipientData['name'] || recipientData['Attendee Name'] || 'https://qrcodeng.com';
            }
          }

          if (!resolved.includes('{{') && !resolved.includes('[')) {
            qrPayload = resolved;
          }
        }

        const qrBuffer = await QRCode.toBuffer(qrPayload, {
          width: Math.round(template.qrPosition.width),
          margin: 1,
          color: { dark: template.qrConfig?.dataColor || '#000000', light: template.qrConfig?.lightColor || '#ffffff' }
        });

        compositeLayers.push({
          input: qrBuffer,
          top: Math.round(template.qrPosition.y),
          left: Math.round(template.qrPosition.x)
        });

        // 3. Process and Add Text Overlays
        if (template.textOverlays && template.textOverlays.length > 0) {
          for (const ov of template.textOverlays) {
            const processedText = replaceVariables(ov.placeholder, recipientData, variableMappings || {});
            const textSvg = generateTextSvg(processedText, ov.style, Math.round(ov.position.width), Math.round(ov.position.height));
            compositeLayers.push({
              input: textSvg,
              top: Math.round(ov.position.y),
              left: Math.round(ov.position.x)
            });
          }
        }

        // 4. Merge everything using Sharp
        const compositeBuffer = await sharp(bgBuffer)
          .composite(compositeLayers)
          .png()
          .toBuffer();

        // 5. Upload final image to MinIO
        const mergedFileName = `merged/${campaignId}-${toEmail}-${Date.now()}.png`;
        const finalImageUrl = await uploadFileToMinio(compositeBuffer, mergedFileName, 'image/png');

        // 6. Replace background URL in email HTML
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

      // --- FIXED: Increment sentToday quota for the account ---
      await Account.updateOne(
        { email: senderEmail },
        { $inc: { sentToday: 1 } }
      );
      // --------------------------------------------------------

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
          (r: any) => r.data === recipientData || r.data?.email === toEmail || r.data?.['Email Address'] === toEmail
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

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

emailWorker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} failed with error ${err.message}`);
});