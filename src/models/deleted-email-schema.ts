import mongoose, { Document, Schema } from "mongoose";

export interface IDeletedEmail extends Document {
  email: string;
  userId: mongoose.Types.ObjectId;
  deletedAt: Date;
}

const DeletedEmailSchema = new Schema<IDeletedEmail>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  deletedAt: { type: Date, default: Date.now },
});

export const deletedEmailModel = mongoose.model<IDeletedEmail>("DeletedEmail", DeletedEmailSchema);