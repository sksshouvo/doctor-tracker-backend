type DoctorLike = {
  _id: unknown;
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export const toDoctorDTO = (d: DoctorLike, patientCount?: number) => ({
  id: String(d._id),
  name: d.name,
  specialization: d.specialization,
  hospital: d.hospital,
  phone: d.phone,
  email: d.email,
  ...(patientCount !== undefined ? { patientCount } : {}),
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});
