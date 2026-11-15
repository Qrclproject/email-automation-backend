import { google } from 'googleapis';
import { createOAuth2Client } from './googleAuthService';
import Account from '../models/Account';

export const sendEmail = async (
  accountId: string,
  to: string,
  subject: string,
  htmlBody: string
) => {
  try {
    // 1. Get the account (which holds the refresh token) from MongoDB
    const account = await Account.findById(accountId);
    if (!account || !account.refreshToken) {
      throw new Error('Account not found or missing refresh token');
    }

    // 2. Set up the OAuth client with the saved refresh token
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: account.refreshToken });

    // 3. Initialize the Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // 4. Construct the raw MIME email message
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: ${account.displayName || account.email} <${account.email}>`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
    ];
    const message = messageParts.join('\n');

    // 5. Encode the message in base64url format (required by Gmail API)
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 6. Send the email!
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { success: true, messageId: res.data.id };
  } catch (error: any) {
    console.error('Error sending email:', error.message);
    throw new Error(error.message);
  }
};