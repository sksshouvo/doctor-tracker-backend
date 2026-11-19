import { Schema, model, type InferSchemaType } from 'mongoose';
import { buildSearchTokens } from '../../utils/searchTokens.js';

export const PHONE_REGEX = /^[+]?[0-9\s\-()]{7,20}$/;

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    specialization: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    hospital: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    phone: { type: String, required: true, trim: true, match: PHONE_REGEX },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    searchTokens: { type: [String], select: false, default: undefined },
  },
  { timestamps: true, versionKey: false },
);

doctorSchema.pre('validate', function () {
  this.searchTokens = buildSearchTokens(this.name, this.specialization, this.hospital, this.email);
});

doctorSchema.index({ email: 1 }, { unique: true });
doctorSchema.index({ createdAt: -1, _id: -1 });
doctorSchema.index({ name: 1, _id: 1 });
doctorSchema.index({ specialization: 1, createdAt: -1, _id: -1 });
doctorSchema.index({ hospital: 1, createdAt: -1, _id: -1 });
doctorSchema.index({ searchTokens: 1, createdAt: -1 });

export type DoctorDoc = InferSchemaType<typeof doctorSchema>;
export const Doctor = model('Doctor', doctorSchema);
