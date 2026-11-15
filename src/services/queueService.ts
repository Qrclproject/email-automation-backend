import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue('email-sending', { connection });

export const addEmailsToQueue = async (
  campaignId: string, 
  recipients: any[], 
  subject: string, 
  body: string, 
  senderEmail: string, 
  refreshToken: string,
  variableMappings: Record<string, string>
) => {
  const jobs = recipients.map((recipient) => ({
    name: `send-email-${campaignId}`,
    data: {
      recipientData: recipient.data,
      subject,
      body,
      senderEmail,
      refreshToken,
      campaignId,
      variableMappings // <-- Passed to worker
    },
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  }));

  await emailQueue.addBulk(jobs);
  console.log(`✅ Added ${jobs.length} emails to the queue for campaign ${campaignId}`);
};