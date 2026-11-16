import mongoose, { Schema, Document } from 'mongoose';

export interface IDesign extends Document {
  name: string;
  imageUrl: string;
  qrPosition?: any;
  qrPadding?: number;
  qrConfig?: any;
  qrDataField?: string; // Added this
  textOverlays?: any[];
}

const designSchema: Schema = new Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  qrPosition: { type: Schema.Types.Mixed },
  qrPadding: { type: Number },
  qrConfig: { type: Schema.Types.Mixed },
  qrDataField: { type: String, default: '{{Email Address}}' }, // Added this
  textOverlays: { type: [Schema.Types.Mixed] },
}, { timestamps: true });

export default mongoose.model<IDesign>('Design', designSchema);