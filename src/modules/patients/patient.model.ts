import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { buildSearchTokens } from '../../utils/searchTokens.js';
import { PHONE_REGEX } from '../doctors/doctor.model.js';

export const CONDITIONS = [
  'stable',
  'critical',
  'recovering',
  'under_observation',
  'discharged',
] as const;
export const GENDERS = ['male', 'female', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    age: { type: Number, required: true, min: 0, max: 130, validate: Number.isInteger },
    gender: { type: String, required: true, enum: GENDERS },
    phone: { type: String, required: true, trim: true, match: PHONE_REGEX },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true, maxlength: 250 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS },
    diagnosis: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    condition: { type: String, required: true, enum: CONDITIONS },
    visitDate: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    searchTokens: { type: [String], select: false, default: undefined },
  },
  { timestamps: true, versionKey: false },
);

patientSchema.pre('validate', function () {
  this.searchTokens = buildSearchTokens(this.name, this.diagnosis, this.email, this.phone);
});

patientSchema.index({ doctor: 1, visitDate: -1, _id: -1 });
patientSchema.index({ visitDate: -1, _id: -1 });
patientSchema.index({ createdAt: -1, _id: -1 });
patientSchema.index({ condition: 1, visitDate: -1, _id: -1 });
patientSchema.index({ name: 1, _id: 1 });
patientSchema.index({ searchTokens: 1, visitDate: -1 });

export type PatientDoc = InferSchemaType<typeof patientSchema>;
export const Patient = model('Patient', patientSchema);
export { Types };
