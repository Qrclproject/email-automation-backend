import mongoose, { Schema, Document } from 'mongoose';

export interface ICampaign extends Document {
  name: string;
  subject: string;
  status: 'Draft' | 'Awaiting Approval' | 'Approved' | 'Scheduled' | 'Sending' | 'Paused' | 'Completed' | 'Cancelled' | 'Failed';
  senderAccount: string;
  template: any; 
  columns: string[];
  recipients: any[]; 
  variableMappings: Record<string, string>;
  checkInDisplayColumns: string[]; // <-- ADDED THIS
  emailBody: string;
  attachments: string[];
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  bouncedCount: number;
  progress: number;
}

const campaignSchema: Schema = new Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Draft', 'Awaiting Approval', 'Approved', 'Scheduled', 'Sending', 'Paused', 'Completed', 'Cancelled', 'Failed'],
    default: 'Draft'
  },
  senderAccount: { type: String, required: true },
  template: { type: Schema.Types.Mixed },
  columns: [{ type: String }],
  recipients: [{ type: Schema.Types.Mixed }], 
  variableMappings: { type: Schema.Types.Mixed },
  checkInDisplayColumns: [{ type: String }], // <-- ADDED THIS
  emailBody: { type: String },
  attachments: [{ type: String }],
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  bouncedCount: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<ICampaign>('Campaign', campaignSchema);